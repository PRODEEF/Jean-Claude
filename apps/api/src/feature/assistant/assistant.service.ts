import {
  addTaskListItemsPayloadSchema,
  assignFoldersPayloadSchema,
  createProjectFoldersPayloadSchema,
  createTaskListsPayloadSchema,
  scheduleListsPayloadSchema,
  type AssignFoldersPayload,
  type CalendarEvent,
  type Folder,
  type FolderPurpose,
  type FolderTreeNode,
  type ResolveSuggestion,
  type ScheduleListsPayload,
  type Suggestion,
  type TaskList,
  type TaskListKind,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import type { CalendarService } from "../../domain/calendar/calendar.service.js";
import type { ConversationService } from "../../domain/conversation/conversation.service.js";
import type { FolderService } from "../../domain/folder/folder.service.js";
import type { SuggestionService } from "../../domain/suggestion/suggestion.service.js";
import type { TaskService } from "../../domain/task/task.service.js";

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

    // L'utilisateur a pu décocher des dossiers avant d'accepter : c'est le
    // rangement retenu qui s'applique, et c'est lui qui est réécrit dans la
    // proposition — la trace laissée dans le fil doit dire ce qui a été fait.
    const retained = retainedFolders(suggestion, input.folderSelection);
    const applied = await this.apply(
      userId,
      retained ? { ...suggestion, payload: retained } : suggestion,
      accessToken,
    );

    return {
      ...applied,
      suggestion: await this.suggestions.markResolved(id, "accepted", accessToken, retained),
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

    // Reste le rendez-vous récurrent (A.11), inscrit au contrat mais sans
    // module pour l'exécuter.
    throw httpError(422, "Cette proposition n'est pas encore prise en charge.");
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
      console.error("Charge utile de todoliste illisible", suggestion.id);
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
      console.error("Charge utile de complétion illisible", suggestion.id);
      throw httpError(422, "Cette proposition n'est plus exploitable.");
    }

    for (const item of payload.data.items) {
      await this.tasks.addTask(userId, payload.data.listId, { title: item.title }, accessToken);
    }

    return [];
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
   * L'événement n'a pas de fin : une échéance déduite d'une conversation dit
   * quand, pas combien de temps. Le calendrier lui donne déjà une durée
   * implicite à l'affichage — en inventer une ici la ferait passer pour une
   * information venue de l'utilisateur.
   */
  private async scheduleTasks(
    userId: string,
    suggestion: Suggestion,
    accessToken: string,
  ): Promise<CalendarEvent[]> {
    const payload = scheduleListsPayloadSchema.safeParse(suggestion.payload);

    if (!payload.success) {
      console.error("Charge utile de créneau illisible", suggestion.id);
      throw httpError(422, "Cette proposition n'est plus exploitable.");
    }

    const events: CalendarEvent[] = [];

    for (const entry of payload.data.lists) {
      const event = await this.calendar.create(
        userId,
        { title: entry.title, startsAt: entry.dueAt, endsAt: null, allDay: false },
        accessToken,
      );

      try {
        await this.tasks.linkEvent(entry.listId, event.id, accessToken);
      } catch {
        // Liste supprimée entre la proposition et son acceptation : le créneau
        // reste, il porte l'information. Faire échouer l'acceptation entière
        // annulerait les créneaux déjà posés pour les listes précédentes.
        console.warn("Liste introuvable au moment de poser son créneau", entry.listId);
      }

      events.push(event);
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
      console.error("Charge utile de rangement illisible", suggestion.id);
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
      else console.warn("Dossier proposé inconnu, ignoré", suggestion.id);
    }

    for (const name of payload.data.newFolderNames) {
      const existing = known.find((folder) => sameName(folder.name, name));
      if (existing) {
        targetIds.add(existing.id);
        continue;
      }

      const folder = await this.folders.create(
        userId,
        { name, parentId: null, createdByAssistant: true },
        accessToken,
      );
      created.push(folder);
      targetIds.add(folder.id);
    }

    if (targetIds.size === 0) {
      console.error("Rangement sans dossier applicable", suggestion.id);
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
      console.error("Charge utile de suggestion illisible", suggestion.id);
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
    newFolderNames: proposed.data.newFolderNames.filter((name) =>
      selection.newFolderNames.some((kept) => sameName(kept, name)),
    ),
  };

  if (retained.existingFolderIds.length + retained.newFolderNames.length === 0) {
    throw httpError(400, "Aucun des dossiers retenus ne figure dans la proposition.");
  }

  return retained;
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
