import {
  addTaskListItemsPayloadSchema,
  assignFoldersPayloadSchema,
  createEventsPayloadSchema,
  createFeedbackSchema,
  createProjectFoldersPayloadSchema,
  createRecurringEventPayloadSchema,
  createTaskListsPayloadSchema,
  scheduleListsPayloadSchema,
  updateTaskListDueDatePayloadSchema,
  updateTaskListItemsPayloadSchema,
  userPreferencesSchema,
  type AssignFoldersPayload,
  type CalendarEvent,
  type CreateTaskListsPayload,
  type Folder,
  type FolderPurpose,
  type FolderTreeNode,
  type ResolveSuggestion,
  type ScheduleListsPayload,
  type Suggestion,
  type TaskList,
  type TaskListKind,
  type UserPreferences,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import { logger } from "../../core/logger.js";
import { hasWallTime } from "../../core/timezone.js";
import type { CalendarService } from "../../domain/calendar/calendar.service.js";
import type { ConversationService } from "../../domain/conversation/conversation.service.js";
import type { FeedbackService } from "../../domain/feedback/feedback.service.js";
import type { FolderService } from "../../domain/folder/folder.service.js";
import type { SuggestionService } from "../../domain/suggestion/suggestion.service.js";
import type { TaskService } from "../../domain/task/task.service.js";
import type { IUserRepository } from "../../domain/user/user.repository.interface.js";

/** Fuseau retenu quand le profil est illisible — celui du schéma partagé. */
const DEFAULT_TIMEZONE: UserPreferences["timezone"] = userPreferencesSchema.shape.timezone.parse(
  undefined,
);

/** Rappel par défaut d'une série récurrente, en minutes (A.11). */
const DEFAULT_RECURRING_REMINDER_MINUTES = 30;

export type ResolvedSuggestion = {
  suggestion: Suggestion;
  /** Dossiers réellement créés — vide sur un refus, ou si tout existait déjà. */
  folders: Folder[];
  /** Todolistes créées, tâches comprises (§12.1, A.2). */
  taskLists: TaskList[];
  /** Créneaux posés dans l'agenda (A.3). */
  events: CalendarEvent[];
  /**
   * Proposition que l'acceptation fait naître à son tour (§12.1).
   *
   * Accepter des todolistes dont certaines tâches portent une date amène la
   * question suivante — « je te les pose dans ton agenda ? ». Elle est rendue
   * ici pour que le client sache qu'une carte vient de s'ajouter au fil, mais
   * elle est persistée en attente comme les autres : rien n'est exécuté.
   */
  next: Suggestion | null;
};

/** Ce que l'acceptation a produit, hors de la suggestion elle-même. */
type Applied = Omit<ResolvedSuggestion, "suggestion">;

const SCOPE = "assistant.service";

/** Un refus, ou une proposition qui n'a rien créé. */
function nothingApplied(): Applied {
  return { folders: [], taskLists: [], events: [], next: null };
}

/**
 * Cas d'usage du canal permanent : ce que devient une proposition de
 * l'assistant quand l'utilisateur y répond (§12.1, A.4).
 *
 * Vit dans `feature/` et non dans `domain/` parce qu'il compose deux entités —
 * la suggestion et le dossier. C'est le seul endroit où une proposition se
 * transforme en données.
 */
export class AssistantService {
  constructor(
    private readonly suggestions: SuggestionService,
    private readonly folders: FolderService,
    private readonly conversations: ConversationService,
    private readonly tasks: TaskService,
    private readonly calendar: CalendarService,
    private readonly users: IUserRepository,
    private readonly feedback: FeedbackService,
  ) {}

  /**
   * Ce que l'assistant a proposé sur ce fil, tranché ou non.
   *
   * Les propositions déjà réglées ne sont pas retirées : une fois acceptée,
   * une proposition a créé des dossiers ou rangé la conversation, et
   * l'utilisateur doit pouvoir relire dans le fil ce qui s'est passé. Les
   * faire disparaître laisserait des dossiers apparus sans explication.
   */
  listForConversation(conversationId: string, accessToken: string): Promise<Suggestion[]> {
    return this.suggestions.listForConversation(conversationId, accessToken);
  }

  async resolve(
    userId: string,
    id: string,
    input: ResolveSuggestion,
    accessToken: string,
  ): Promise<ResolvedSuggestion> {
    const suggestion = await this.suggestions.requirePending(id, accessToken);

    if (input.action === "dismiss") {
      return {
        ...nothingApplied(),
        suggestion: await this.suggestions.markResolved(id, "dismissed", accessToken),
      };
    }

    // L'utilisateur a pu décocher des dossiers, ou corriger une todoliste,
    // avant d'accepter : c'est ce qu'il a retenu qui s'applique, et c'est lui
    // qui est réécrit dans la proposition — la trace laissée dans le fil doit
    // dire ce qui a été fait.
    const retained = retainedFolders(suggestion, input.folderSelection);
    const edited = editedTaskLists(suggestion, input.taskListEdits);
    const withContext = withBugReportContext(suggestion, input.bugReportContext);
    const payload = retained ?? edited ?? withContext;
    const applied = await this.apply(
      userId,
      payload ? { ...suggestion, payload } : suggestion,
      accessToken,
    );

    return {
      ...applied,
      suggestion: await this.suggestions.markResolved(id, "accepted", accessToken, payload),
    };
  }

  private async apply(
    userId: string,
    suggestion: Suggestion,
    accessToken: string,
  ): Promise<Applied> {
    if (suggestion.kind === "create_project_folders") {
      const folders = await this.createFolders(userId, suggestion, accessToken);
      return { ...nothingApplied(), folders };
    }
    if (suggestion.kind === "assign_folders") {
      const folders = await this.fileConversation(userId, suggestion, accessToken);
      return { ...nothingApplied(), folders };
    }
    if (suggestion.kind === "create_task_list") {
      const created = await this.createTaskLists(userId, suggestion, accessToken);
      return { ...nothingApplied(), ...created };
    }
    if (suggestion.kind === "add_task_list_items") {
      const taskLists = await this.addTaskListItems(userId, suggestion, accessToken);
      return { ...nothingApplied(), taskLists };
    }
    if (suggestion.kind === "schedule_task") {
      const events = await this.scheduleTasks(userId, suggestion, accessToken);
      return { ...nothingApplied(), events };
    }
    if (suggestion.kind === "update_task_list_due_date") {
      const taskLists = await this.rescheduleTaskList(userId, suggestion, accessToken);
      return { ...nothingApplied(), taskLists };
    }
    if (suggestion.kind === "update_task_list_items") {
      const taskLists = await this.updateTaskListItems(userId, suggestion, accessToken);
      return { ...nothingApplied(), taskLists };
    }
    if (suggestion.kind === "report_bug") {
      await this.reportBug(userId, suggestion, accessToken);
      return nothingApplied();
    }
    if (suggestion.kind === "create_recurring_event") {
      const events = await this.createRecurringEvent(userId, suggestion, accessToken);
      return { ...nothingApplied(), events };
    }
    if (suggestion.kind === "create_events") {
      const events = await this.createEvents(userId, suggestion, accessToken);
      return { ...nothingApplied(), events };
    }

    throw httpError(422, "Cette proposition n'est plus exploitable.");
  }

  /**
   * Crée les todolistes proposées, puis enchaîne sur leurs dates (§12.1, A.2).
   *
   * Les listes naissent dans le dossier de la conversation quand elle en a un :
   * l'utilisateur ne choisit jamais où ranger au moment de créer (§13.4.1), et
   * une liste sortie d'une conversation déjà rangée relève du même sujet
   * qu'elle. Sans dossier, elle reste lisible dans l'onglet Mes listes, qui est
   * de toute façon la vue « tous dossiers confondus ».
   *
   * Quand ce dossier porte un sous-dossier typé du bon purpose (A.4) — TODO
   * pour une liste de tâches, ACHAT pour une liste de courses — la liste y
   * naît directement plutôt que dans le dossier projet lui-même.
   *
   * Les tâches sont ajoutées l'une après l'autre plutôt qu'en parallèle : leur
   * position se calcule à partir de celles déjà prises dans la liste, et deux
   * insertions concurrentes se verraient attribuer la même.
   */
  private async createTaskLists(
    userId: string,
    suggestion: Suggestion,
    accessToken: string,
  ): Promise<{ taskLists: TaskList[]; next: Suggestion | null }> {
    const payload = createTaskListsPayloadSchema.safeParse(suggestion.payload);

    if (!payload.success || !suggestion.conversationId) {
      logger.error(SCOPE, "Charge utile de todoliste illisible", suggestion.id);
      throw httpError(422, "Cette proposition n'est plus exploitable.");
    }

    const conversationId = suggestion.conversationId;
    const conversation = await this.conversations.getById(conversationId, accessToken);
    const fallbackFolderId = conversation.folderIds[0] ?? null;
    const tree = conversation.folderIds.length > 0 ? await this.folders.getTree(accessToken) : [];

    const taskLists: TaskList[] = [];
    const dated: ScheduleListsPayload["lists"] = [];

    for (const proposed of payload.data.lists) {
      const typedFolderId = findTypedFolder(
        tree,
        conversation.folderIds,
        TASK_LIST_FOLDER_PURPOSE[proposed.kind],
      );

      const list = await this.tasks.createList(
        userId,
        {
          title: proposed.title,
          kind: proposed.kind,
          folderId: typedFolderId ?? fallbackFolderId,
          dueAt: proposed.dueAt,
          conversationId,
          createdByAssistant: true,
        },
        accessToken,
      );
      taskLists.push(list);

      if (list.dueAt !== null) {
        dated.push({ listId: list.id, title: list.title, dueAt: list.dueAt });
      }

      for (const item of proposed.items) {
        await this.tasks.addTask(userId, list.id, { title: item.title }, accessToken);
      }
    }

    const next = await this.proposeSchedule(userId, conversationId, dated, accessToken);
    return { taskLists, next };
  }

  /**
   * Ajoute les lignes proposées à une liste qui existe déjà (§12.1, A.2).
   *
   * Compléter et non recréer : « complète la liste » désigne celle dont on
   * vient de parler, et y répondre par une seconde liste homonyme laisserait
   * l'utilisateur avec deux fois le même sujet.
   *
   * Les lignes sont ajoutées l'une après l'autre plutôt qu'en parallèle : leur
   * position se calcule à partir de celles déjà prises dans la liste, et deux
   * insertions concurrentes se verraient attribuer la même.
   *
   * La liste est relue avant d'écrire — c'est ce que fait `addTask` — donc une
   * liste supprimée entre la proposition et son acceptation rend un 404 plutôt
   * que d'écrire dans le vide. L'appel passe par le jeton de l'utilisateur :
   * les RLS garantissent qu'un identifiant venu d'ailleurs ne trouve rien.
   */
  private async addTaskListItems(
    userId: string,
    suggestion: Suggestion,
    accessToken: string,
  ): Promise<TaskList[]> {
    const payload = addTaskListItemsPayloadSchema.safeParse(suggestion.payload);

    if (!payload.success) {
      logger.error(SCOPE, "Charge utile de complétion illisible", suggestion.id);
      throw httpError(422, "Cette proposition n'est plus exploitable.");
    }

    for (const item of payload.data.items) {
      await this.tasks.addTask(userId, payload.data.listId, { title: item.title }, accessToken);
    }

    return [];
  }

  /**
   * Déplace l'échéance d'une todoliste qui existe déjà (§12.1, A.2).
   *
   * La liste est relue avant d'écrire — c'est ce que fait `updateList` — donc
   * une liste supprimée entre la proposition et son acceptation rend un 404
   * plutôt que d'écrire dans le vide.
   */
  private async rescheduleTaskList(
    userId: string,
    suggestion: Suggestion,
    accessToken: string,
  ): Promise<TaskList[]> {
    const payload = updateTaskListDueDatePayloadSchema.safeParse(suggestion.payload);

    if (!payload.success) {
      logger.error(SCOPE, "Charge utile de reprogrammation illisible", suggestion.id);
      throw httpError(422, "Cette proposition n'est plus exploitable.");
    }

    const updated = await this.tasks.updateList(
      userId,
      payload.data.listId,
      { dueAt: payload.data.dueAt },
      accessToken,
    );

    return [updated];
  }

  /**
   * Coche, décoche ou renomme des lignes d'une liste qui existe déjà (§12.1, A.2).
   *
   * Une ligne à la fois plutôt qu'en parallèle : `updateTask` relit la liste
   * à chaque passe, et deux écritures concurrentes se marcheraient dessus.
   * Une ligne disparue entre la proposition et l'acceptation rend un 404
   * plutôt que d'écrire dans le vide.
   */
  private async updateTaskListItems(
    _userId: string,
    suggestion: Suggestion,
    accessToken: string,
  ): Promise<TaskList[]> {
    const payload = updateTaskListItemsPayloadSchema.safeParse(suggestion.payload);

    if (!payload.success) {
      logger.error(SCOPE, "Charge utile de modification de lignes illisible", suggestion.id);
      throw httpError(422, "Cette proposition n'est plus exploitable.");
    }

    for (const item of payload.data.items) {
      const patch: { title?: string; done?: boolean } = {};
      if (item.title !== undefined) patch.title = item.title;
      if (item.done !== undefined) patch.done = item.done;
      await this.tasks.updateTask(payload.data.listId, item.taskId, patch, accessToken);
    }

    return [];
  }

  /**
   * Transmet le signalement à `feedback`, catégorie bug (§12.1, A.10).
   *
   * `platform` et `screen` n'arrivent qu'à l'acceptation, fusionnés dans la
   * charge utile par `withBugReportContext` : une acceptation reçue sans eux —
   * client ancien, appel direct à l'API — rend la charge utile illisible
   * plutôt que d'insérer un signalement à moitié renseigné.
   */
  private async reportBug(userId: string, suggestion: Suggestion, accessToken: string): Promise<void> {
    const payload = createFeedbackSchema.safeParse({ ...suggestion.payload, category: "bug" });

    if (!payload.success) {
      logger.error(SCOPE, "Charge utile de signalement illisible", suggestion.id);
      throw httpError(422, "Cette proposition n'est plus exploitable.");
    }

    await this.feedback.submitGeneral(userId, payload.data, accessToken);
  }

  /**
   * Deuxième temps du §12.1 : « puis proposer d'y associer des dates ».
   *
   * Une proposition et non une création : les créneaux n'apparaissent dans
   * l'agenda que si l'utilisateur accepte cette seconde carte.
   */
  private proposeSchedule(
    userId: string,
    conversationId: string,
    lists: ScheduleListsPayload["lists"],
    accessToken: string,
  ): Promise<Suggestion | null> {
    if (lists.length === 0) return Promise.resolve(null);

    return this.suggestions.propose(
      userId,
      conversationId,
      { kind: "schedule_task", message: scheduleMessage(lists.length), payload: { lists } },
      accessToken,
    );
  }

  /**
   * Pose dans l'agenda un créneau par liste datée (A.3).
   *
   * Un créneau par liste et non par ligne : l'échéance appartient à la liste,
   * et poser autant d'événements qu'elle a d'items remplirait la journée de
   * doublons pour une seule chose à faire.
   *
   * `allDay` est dérivé de l'heure murale du profil, même principe que
   * `TaskService.syncLinkedEvent` pour le sens inverse : minuit vaut « dans
   * la journée », une échéance qui porte une heure précise (« les courses
   * samedi à 10h », A.3, #18) vaut un rendez-vous à heure fixe.
   */
  private async scheduleTasks(
    userId: string,
    suggestion: Suggestion,
    accessToken: string,
  ): Promise<CalendarEvent[]> {
    const payload = scheduleListsPayloadSchema.safeParse(suggestion.payload);

    if (!payload.success) {
      logger.error(SCOPE, "Charge utile de créneau illisible", suggestion.id);
      throw httpError(422, "Cette proposition n'est plus exploitable.");
    }

    const profile = await this.users.findById(userId, accessToken);
    const timezone = profile?.preferences.timezone ?? DEFAULT_TIMEZONE;

    const events: CalendarEvent[] = [];

    for (const entry of payload.data.lists) {
      const timed = hasWallTime(entry.dueAt, timezone);
      const event = await this.calendar.create(
        userId,
        {
          title: entry.title,
          startsAt: entry.dueAt,
          endsAt: timed ? oneHourAfter(entry.dueAt) : null,
          allDay: !timed,
        },
        accessToken,
      );

      try {
        await this.tasks.linkEvent(entry.listId, event.id, accessToken);
      } catch {
        // Liste supprimée entre la proposition et son acceptation : le créneau
        // reste, il porte l'information. Faire échouer l'acceptation entière
        // annulerait les créneaux déjà posés pour les listes précédentes.
        logger.warn(SCOPE, "Liste introuvable au moment de poser son créneau", entry.listId);
      }

      events.push(event);
    }

    return events;
  }

  /**
   * Pose un rendez-vous récurrent dans l'agenda (A.11).
   *
   * Une seule ligne avec `rrule` : les occurrences ne sont pas encore
   * expansées — l'événement n'apparaît qu'à son premier créneau. Le rappel
   * tombe à 30 min si le modèle n'en a pas proposé, pour que la série ne
   * demande pas de ressaisie.
   */
  private async createRecurringEvent(
    userId: string,
    suggestion: Suggestion,
    accessToken: string,
  ): Promise<CalendarEvent[]> {
    const payload = createRecurringEventPayloadSchema.safeParse(suggestion.payload);

    if (!payload.success) {
      logger.error(SCOPE, "Charge utile de rendez-vous récurrent illisible", suggestion.id);
      throw httpError(422, "Cette proposition n'est plus exploitable.");
    }

    const profile = await this.users.findById(userId, accessToken);
    const timezone = profile?.preferences.timezone ?? DEFAULT_TIMEZONE;
    const timed = hasWallTime(payload.data.startsAt, timezone);

    const event = await this.calendar.create(
      userId,
      {
        title: payload.data.title,
        startsAt: payload.data.startsAt,
        endsAt: timed ? oneHourAfter(payload.data.startsAt) : null,
        allDay: !timed,
        rrule: payload.data.rrule,
        reminderMinutesBefore: payload.data.reminderMinutesBefore ?? DEFAULT_RECURRING_REMINDER_MINUTES,
      },
      accessToken,
    );

    return [event];
  }

  /**
   * Pose dans l'agenda un rendez-vous par entrée proposée (A.3).
   *
   * Distincte de `createRecurringEvent` : chaque entrée est un événement
   * indépendant, sans `rrule`. Les rendez-vous sont posés l'un après l'autre
   * plutôt qu'en parallèle pour qu'un événement dont la création échoue ne
   * fasse pas perdre ceux qui le suivent dans le même lot.
   *
   * `allDay` et `endsAt` sont dérivés de l'heure murale de `startsAt`, même
   * principe que `scheduleTasks` et `createRecurringEvent` : minuit vaut
   * « dans la journée », une heure précise vaut un rendez-vous à heure fixe.
   */
  private async createEvents(
    userId: string,
    suggestion: Suggestion,
    accessToken: string,
  ): Promise<CalendarEvent[]> {
    const payload = createEventsPayloadSchema.safeParse(suggestion.payload);

    if (!payload.success) {
      logger.error(SCOPE, "Charge utile de rendez-vous illisible", suggestion.id);
      throw httpError(422, "Cette proposition n'est plus exploitable.");
    }

    const profile = await this.users.findById(userId, accessToken);
    const timezone = profile?.preferences.timezone ?? DEFAULT_TIMEZONE;

    const events: CalendarEvent[] = [];

    for (const proposed of payload.data.events) {
      const timed = hasWallTime(proposed.startsAt, timezone);
      events.push(
        await this.calendar.create(
          userId,
          {
            title: proposed.title,
            startsAt: proposed.startsAt,
            endsAt: timed ? oneHourAfter(proposed.startsAt) : null,
            allDay: !timed,
          },
          accessToken,
        ),
      );
    }

    return events;
  }

  /**
   * Range la conversation, en créant au passage les dossiers qui manquent (A.1).
   *
   * L'appel remplace l'ensemble des rattachements, ce qui est sans effet de
   * bord ici : le rangement n'est proposé qu'aux conversations qui n'en ont
   * aucun.
   */
  private async fileConversation(
    userId: string,
    suggestion: Suggestion,
    accessToken: string,
  ): Promise<Folder[]> {
    const payload = assignFoldersPayloadSchema.safeParse(suggestion.payload);

    if (!payload.success || !suggestion.conversationId) {
      logger.error(SCOPE, "Charge utile de rangement illisible", suggestion.id);
      throw httpError(422, "Cette proposition n'est plus exploitable.");
    }

    const tree = await this.folders.getTree(accessToken);
    const known = flatten(tree);
    const targetIds = new Set<string>();
    const created: Folder[] = [];

    for (const id of payload.data.existingFolderIds) {
      // Un identifiant inventé par le modèle échouerait sur la clé étrangère :
      // on l'écarte plutôt que de perdre tout le rangement avec lui.
      if (known.some((folder) => folder.id === id)) targetIds.add(id);
      else logger.warn(SCOPE, "Dossier proposé inconnu, ignoré", suggestion.id);
    }

    for (const proposed of payload.data.newFolders) {
      const existing = known.find((folder) => sameName(folder.name, proposed.name));
      if (existing) {
        targetIds.add(existing.id);
        continue;
      }

      // Un parent supprimé entre la proposition et son acceptation ne doit
      // pas faire échouer tout le rangement : le dossier naît alors à la
      // racine plutôt que de perdre la proposition entière.
      const parentId =
        proposed.parentId && known.some((folder) => folder.id === proposed.parentId)
          ? proposed.parentId
          : null;
      if (proposed.parentId && parentId === null) {
        logger.warn(SCOPE, "Dossier parent introuvable à l'acceptation, posé à la racine", suggestion.id);
      }

      const folder = await this.folders.create(
        userId,
        { name: proposed.name, parentId, createdByAssistant: true },
        accessToken,
      );
      created.push(folder);
      targetIds.add(folder.id);
    }

    if (targetIds.size === 0) {
      logger.error(SCOPE, "Rangement sans dossier applicable", suggestion.id);
      throw httpError(422, "Cette proposition n'est plus exploitable.");
    }

    await this.conversations.assignFolders(
      suggestion.conversationId,
      { folderIds: [...targetIds], source: "assistant" },
      accessToken,
    );

    return created;
  }

  /**
   * Crée l'arborescence proposée, en passant sur ce qui existe déjà.
   *
   * Le pré-contrôle évite de heurter la contrainte d'unicité de `folders`, qui
   * sortirait en 500 après avoir laissé derrière elle les dossiers du début du
   * lot. L'acceptation devient de ce fait rejouable : ce qui manque est créé,
   * le reste est laissé en place.
   */
  private async createFolders(
    userId: string,
    suggestion: Suggestion,
    accessToken: string,
  ): Promise<Folder[]> {
    const payload = createProjectFoldersPayloadSchema.safeParse(suggestion.payload);

    if (!payload.success) {
      // La charge utile a été validée à la capture : échouer ici signifie que
      // le contrat a changé depuis. Le détail reste côté serveur.
      logger.error(SCOPE, "Charge utile de suggestion illisible", suggestion.id);
      throw httpError(422, "Cette proposition n'est plus exploitable.");
    }

    const tree = await this.folders.getTree(accessToken);
    const created: Folder[] = [];

    for (const proposed of payload.data.folders) {
      const existing = tree.find((node) => sameName(node.name, proposed.name));

      const root =
        existing ??
        (await this.folders.create(
          userId,
          {
            name: proposed.name,
            parentId: null,
            purpose: proposed.purpose,
            createdByAssistant: true,
          },
          accessToken,
        ));

      if (!existing) created.push(root);

      for (const child of proposed.children) {
        if (existing?.children.some((node) => sameName(node.name, child.name))) continue;

        created.push(
          await this.folders.create(
            userId,
            {
              name: child.name,
              parentId: root.id,
              purpose: child.purpose,
              createdByAssistant: true,
            },
            accessToken,
          ),
        );
      }
    }

    return created;
  }
}

/**
 * Phrase de la proposition enchaînée, écrite par le serveur.
 *
 * Rédigée ici plutôt que demandée au modèle : à ce stade il n'y a plus rien à
 * interpréter — les tâches datées sont connues. Un second appel au moteur
 * n'ajouterait qu'une latence et le risque qu'il réponde autre chose qu'une
 * question. Elle en reste une, jamais un constat (§12.1).
 */
function scheduleMessage(count: number): string {
  return count === 1
    ? "Cette liste porte une échéance. Je te bloque le créneau dans ton agenda ?"
    : count + " de ces listes portent une échéance. Je te bloque les créneaux dans ton agenda ?";
}

/**
 * Rangement effectivement retenu par l'utilisateur, ou `undefined` s'il n'y a
 * rien à restreindre (§5.2, A.1).
 *
 * L'intersection se fait ici et non dans le client : celui-ci ne peut que
 * retirer des dossiers de la proposition, jamais en ajouter un que l'assistant
 * n'avait pas proposé. Une charge utile illisible passe telle quelle —
 * `fileConversation` la refuse déjà, et la refuser deux fois donnerait deux
 * messages différents pour la même panne.
 */
function retainedFolders(
  suggestion: Suggestion,
  selection: AssignFoldersPayload | undefined,
): AssignFoldersPayload | undefined {
  if (suggestion.kind !== "assign_folders" || !selection) return undefined;

  const proposed = assignFoldersPayloadSchema.safeParse(suggestion.payload);
  if (!proposed.success) return undefined;

  const retained = {
    existingFolderIds: proposed.data.existingFolderIds.filter((id) =>
      selection.existingFolderIds.includes(id),
    ),
    newFolders: proposed.data.newFolders.filter((folder) =>
      selection.newFolders.some((kept) => sameName(kept.name, folder.name)),
    ),
  };

  if (retained.existingFolderIds.length + retained.newFolders.length === 0) {
    throw httpError(400, "Aucun des dossiers retenus ne figure dans la proposition.");
  }

  return retained;
}

/**
 * Listes effectivement retenues par l'utilisateur, corrigées avant validation
 * (§13.4.1, #17), ou `undefined` s'il n'y a rien à substituer.
 *
 * Contrairement à `retainedFolders`, ce n'est pas une intersection avec la
 * proposition d'origine : l'utilisateur peut y corriger un titre que le
 * modèle a mal transcrit, pas seulement en écarter une partie. Le schéma de
 * la charge utile reste le même garde-fou que pour une création ordinaire.
 */
function editedTaskLists(
  suggestion: Suggestion,
  edits: CreateTaskListsPayload | undefined,
): CreateTaskListsPayload | undefined {
  return suggestion.kind === "create_task_list" ? edits : undefined;
}

/**
 * Charge utile `report_bug` complétée du contexte transmis à l'acceptation,
 * ou `undefined` s'il n'y a rien à y ajouter.
 *
 * Contrairement à `retainedFolders`, ce n'est pas une restriction de la
 * proposition d'origine : `platform` et `screen` n'existent nulle part dans
 * ce que le modèle a produit, ils s'y ajoutent.
 */
function withBugReportContext(
  suggestion: Suggestion,
  context: ResolveSuggestion["bugReportContext"],
): Record<string, unknown> | undefined {
  if (suggestion.kind !== "report_bug" || !context) return undefined;
  return { ...suggestion.payload, ...context };
}

/**
 * Deux dossiers portant le même nom à la casse près sont considérés comme le
 * même. Postgres, lui, les accepterait tous les deux : c'est l'utilisateur
 * qu'on protège ici, pas la base — « Jardin » et « jardin » côte à côte dans la
 * barre latérale ne se distinguent pas d'un doublon.
 */
function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("fr") === b.trim().toLocaleLowerCase("fr");
}

/**
 * Tous les dossiers, à toutes les profondeurs.
 *
 * Récursif et non deux niveaux : l'arborescence en compte jusqu'à
 * `MAX_FOLDER_DEPTH`, et un dossier oublié ici serait pris pour un identifiant
 * inventé par le modèle, donc écarté du rangement.
 */
function flatten(tree: FolderTreeNode[]): Folder[] {
  return tree.flatMap((node) => [node, ...flatten(node.children)]);
}

/**
 * Une todoliste de courses rejoint le sous-dossier ACHAT, une todoliste de
 * tâches le sous-dossier TODO (A.4) — les deux vocabulaires, kind de liste et
 * purpose de dossier, ne se recouvrent pas par leur nom.
 */
const TASK_LIST_FOLDER_PURPOSE: Record<TaskListKind, FolderPurpose> = {
  todo: "todo",
  shopping: "purchase",
};

/**
 * Sous-dossier du purpose donné, parmi les enfants directs des dossiers de la
 * conversation (A.4) — une liste d'achats naît dans ACHAT plutôt que dans le
 * dossier projet lui-même, quand ce sous-dossier a été créé.
 */
function findTypedFolder(
  tree: FolderTreeNode[],
  parentIds: string[],
  purpose: FolderPurpose,
): string | null {
  for (const node of tree) {
    if (parentIds.includes(node.id)) {
      const match = node.children.find((child) => child.purpose === purpose);
      if (match) return match.id;
    }

    const found = findTypedFolder(node.children, parentIds, purpose);
    if (found) return found;
  }

  return null;
}

/**
 * Durée par défaut d'un créneau à heure fixe posé pour une todoliste — même
 * convention que celle déjà simulée à l'affichage pour un événement sans fin
 * (calendrier, A.3).
 */
function oneHourAfter(iso: string): string {
  return new Date(new Date(iso).getTime() + 60 * 60 * 1000).toISOString();
}
