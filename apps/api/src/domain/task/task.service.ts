import { randomUUID } from "node:crypto";
import type {
  CreateTask,
  CreateTaskList,
  CursorPagination,
  Paginated,
  ReplaceTasks,
  Task,
  TaskList,
  TaskListWithTasks,
  UpdateTask,
  UpdateTaskList,
  UserPreferences,
} from "@jc/domain";
import { slotForList, userPreferencesSchema } from "@jc/domain";
import { httpError } from "../../core/http.js";
import { logger } from "../../core/logger.js";
import { hasWallTime, isPastCalendarDay, isSameCalendarDay } from "../../core/timezone.js";
import type { ICalendarRepository } from "../calendar/calendar.repository.interface.js";
import type { IUserRepository } from "../user/user.repository.interface.js";
import type {
  ITaskRepository,
  TaskListOrigin,
  TaskPatch,
  TaskRowInput,
} from "./task.repository.interface.js";

/** Fuseau retenu quand le profil est illisible — celui du schéma partagé. */
const DEFAULT_TIMEZONE: UserPreferences["timezone"] = userPreferencesSchema.shape.timezone.parse(
  undefined,
);

const SCOPE = "task.service";

export class TaskService {
  constructor(
    private readonly lists: ITaskRepository,
    private readonly events: ICalendarRepository,
    private readonly users: IUserRepository,
  ) {}

  /**
   * Les listes, tâches comprises, par page — garde-fou pour un compte qui en
   * accumule beaucoup (Phase C : conversion conversation → todoliste, A.2).
   * L'onglet Mes listes reste la vue « tous dossiers confondus » : c'est le
   * client qui recompose l'ensemble en enchaînant les pages, pas l'API qui
   * borne la vue.
   */
  list(accessToken: string, pagination: CursorPagination): Promise<Paginated<TaskListWithTasks>> {
    return this.lists.findAll(accessToken, {
      ...(pagination.cursor ? { cursor: pagination.cursor } : {}),
      limit: pagination.limit,
    });
  }

  /**
   * Listes nées d'une conversation.
   *
   * Sert la consigne système : le modèle ne peut compléter une liste que s'il
   * sait laquelle existe et ce qu'elle contient. Bornées à la conversation
   * courante plutôt qu'à tout le compte — « complète la liste » désigne celle
   * dont on vient de parler, et verser toutes les listes de l'utilisateur dans
   * la consigne la ferait grossir à chaque tour.
   */
  listForConversation(conversationId: string, accessToken: string): Promise<TaskListWithTasks[]> {
    return this.lists.findByConversation(conversationId, accessToken);
  }

  async createList(
    userId: string,
    input: CreateTaskList & TaskListOrigin,
    accessToken: string,
  ): Promise<TaskList> {
    await this.assertDueNotPast(userId, input.dueAt, accessToken);
    const due = await this.resolveDue(userId, input, accessToken);
    return this.lists.createList(userId, { ...input, ...due }, accessToken);
  }

  /**
   * Solidarise l'échéance et son moment avant écriture.
   *
   * Les deux vont ensemble : sans échéance, il n'y a pas de moment à
   * enregistrer, et la base le vérifie. Quand l'appelant ne dit pas l'intention
   * — l'assistant, qui ne produit qu'un instant —, elle se déduit de l'heure
   * murale du profil : c'est la seule horloge dont le serveur dispose, et
   * c'est celle dans laquelle l'utilisateur a parlé.
   *
   * Un moment envoyé sans échéance est ignoré : il n'accompagne jamais rien.
   */
  private async resolveDue(
    userId: string,
    patch: { dueAt?: string | null | undefined; dueAllDay?: boolean | undefined },
    accessToken: string,
  ): Promise<{ dueAt?: string | null; dueAllDay?: boolean | null }> {
    if (patch.dueAt === undefined) return {};
    if (patch.dueAt === null) return { dueAt: null, dueAllDay: null };
    if (patch.dueAllDay !== undefined) return { dueAt: patch.dueAt, dueAllDay: patch.dueAllDay };

    const timezone = await this.timezoneOf(userId, accessToken);
    return { dueAt: patch.dueAt, dueAllDay: !hasWallTime(patch.dueAt, timezone) };
  }

  /** Fuseau du profil, ou celui du schéma partagé quand le profil est illisible. */
  private async timezoneOf(userId: string, accessToken: string): Promise<string> {
    const profile = await this.users.findById(userId, accessToken);
    return profile?.preferences.timezone ?? DEFAULT_TIMEZONE;
  }

  /**
   * Modifie une liste, puis reprojette le créneau qui la représente (A.3).
   *
   * La liste est la source, le créneau en est la projection : le titre autant
   * que la date y sont repoussés. Renommer une liste laissait jusqu'ici
   * l'agenda annoncer l'ancien nom, et lui retirer son échéance était refusé
   * faute de savoir quoi faire du créneau — il est maintenant supprimé avec
   * elle, ce qu'une liste sans date appelle naturellement.
   */
  async updateList(
    userId: string,
    id: string,
    patch: UpdateTaskList,
    accessToken: string,
  ): Promise<TaskList> {
    const existing = await this.requireList(id, accessToken);
    await this.assertDueNotPast(userId, patch.dueAt, accessToken, existing.dueAt);

    const due = await this.resolveDue(userId, patch, accessToken);
    const updated = await this.lists.updateList(id, { ...patch, ...due }, accessToken);

    if (existing.eventId !== null) {
      await this.projectSlot(existing.eventId, updated, accessToken);
    }

    return updated;
  }

  /**
   * Reprojette la liste sur le créneau de l'agenda qui la représente.
   *
   * Silencieux en cas d'échec : le rendez-vous a pu disparaître entre-temps,
   * et la liste garde alors ce qu'on vient d'en écrire — c'est leur seule
   * synchronisation qui manque, pas la modification demandée.
   */
  private async projectSlot(eventId: string, list: TaskList, accessToken: string): Promise<void> {
    const slot = slotForList(list);

    try {
      if (slot === null) await this.events.delete(eventId, accessToken);
      else await this.events.update(eventId, slot, accessToken);
    } catch (error) {
      logger.warn(
        SCOPE,
        "Projection du créneau lié impossible :",
        error instanceof Error ? error.message : error,
      );
    }
  }

  /**
   * Supprime une liste, et le créneau qu'elle occupait dans l'agenda.
   *
   * La clé étrangère ne joue que dans l'autre sens — supprimer le rendez-vous
   * détache la liste : sans ce geste, l'agenda gardait un créneau dont plus
   * rien ne disait ce qu'il y avait à y faire.
   */
  async deleteList(id: string, accessToken: string): Promise<void> {
    const existing = await this.requireList(id, accessToken);
    await this.lists.deleteList(id, accessToken);

    if (existing.eventId === null) return;

    try {
      await this.events.delete(existing.eventId, accessToken);
    } catch (error) {
      logger.warn(
        SCOPE,
        "Suppression du créneau lié impossible :",
        error instanceof Error ? error.message : error,
      );
    }
  }

  /**
   * Ajoute une tâche en fin de liste.
   *
   * La position est calculée à partir de celles déjà prises plutôt que du
   * nombre de tâches : une suppression laisse un trou dans la suite, et
   * compter les lignes rendrait alors une position déjà occupée.
   */
  async addTask(
    userId: string,
    listId: string,
    input: CreateTask,
    accessToken: string,
  ): Promise<Task> {
    const list = await this.requireList(listId, accessToken);
    const last = list.tasks.reduce((max, task) => Math.max(max, task.position), -1);
    return this.lists.createTask(userId, listId, input, last + 1, accessToken);
  }

  /**
   * Modifie une tâche.
   *
   * Cocher horodate la complétion, décocher l'efface : sans cela, une tâche
   * ressortie de la corbeille garderait la date à laquelle elle avait été
   * faite une première fois.
   */
  async updateTask(
    listId: string,
    taskId: string,
    patch: UpdateTask,
    accessToken: string,
  ): Promise<Task> {
    await this.requireTask(listId, taskId, accessToken);

    const completion: TaskPatch =
      patch.done === undefined
        ? patch
        : { ...patch, completedAt: patch.done ? new Date().toISOString() : null };

    return this.lists.updateTask(listId, taskId, completion, accessToken);
  }

  /**
   * Rattache la liste au créneau posé pour elle (A.3).
   *
   * Méthode à part de `updateList` : `eventId` ne fait pas partie de ce qu'un
   * client peut modifier, et le calendrier s'appuie sur ce lien pour ne pas
   * afficher deux fois la même échéance — la liste et son créneau.
   */
  async linkEvent(listId: string, eventId: string, accessToken: string): Promise<TaskList> {
    await this.requireList(listId, accessToken);
    return this.lists.updateList(listId, { eventId }, accessToken);
  }

  /**
   * Réécrit le contenu d'une liste, tel que l'éditeur le tient (§13.4.1).
   *
   * L'éditeur envoie des profondeurs ; la filiation se résout ici, dans le
   * service, parce que c'est une règle métier : une ligne indentée appartient
   * à la dernière ligne de premier niveau qui la précède, et une liste qui
   * commencerait par une ligne indentée n'a pas de parent à lui donner — elle
   * remonte au premier niveau plutôt que de faire échouer la sauvegarde.
   *
   * Les identifiants des lignes nouvelles sont posés ici et non par Postgres :
   * une sous-tâche doit pouvoir désigner un parent créé dans la même passe.
   *
   * L'éditeur ne transporte que le texte et l'indentation : la complétion et
   * les notes sont reprises de la liste déjà chargée ici. Cocher et écrire sont
   * deux gestes distincts, et taper une ligne ne doit pas décocher la voisine.
   */
  async replaceTasks(
    userId: string,
    listId: string,
    input: ReplaceTasks,
    accessToken: string,
  ): Promise<Task[]> {
    const list = await this.requireList(listId, accessToken);
    const known = new Map(list.tasks.map((task) => [task.id, task] as const));

    const rows: TaskRowInput[] = [];
    let parentId: string | null = null;

    input.items.forEach((item, position) => {
      // Un identifiant venu d'une autre liste rattacherait une tâche étrangère
      // à celle-ci : il est traité comme une ligne nouvelle, donc sans rien à
      // reprendre.
      const previous = item.id === undefined ? undefined : known.get(item.id);
      const nested = item.depth > 0 && parentId !== null;
      const id = previous?.id ?? randomUUID();

      rows.push({
        id,
        title: item.title,
        parentId: nested ? parentId : null,
        position,
        notes: previous?.notes ?? null,
        done: previous?.done ?? false,
        completedAt: previous?.completedAt ?? null,
      });
      if (!nested) parentId = id;
    });

    const kept = new Set(rows.map((row) => row.id));
    const removed = list.tasks.map((task) => task.id).filter((id) => !kept.has(id));

    return this.lists.replaceTasks(userId, listId, { rows, removed }, accessToken);
  }

  async deleteTask(listId: string, taskId: string, accessToken: string): Promise<void> {
    await this.requireTask(listId, taskId, accessToken);
    await this.lists.deleteTask(listId, taskId, accessToken);
  }

  private async requireList(id: string, accessToken: string): Promise<TaskListWithTasks> {
    const list = await this.lists.findById(id, accessToken);
    if (!list) throw httpError(404, "Liste introuvable.");
    return list;
  }

  private async requireTask(listId: string, taskId: string, accessToken: string): Promise<Task> {
    const list = await this.requireList(listId, accessToken);
    const task = list.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw httpError(404, "Tâche introuvable.");
    return task;
  }

  /**
   * Une échéance ne vise jamais un jour déjà révolu, dans le fuseau du profil.
   *
   * Aujourd'hui reste permis, même à une heure déjà passée : c'est encore
   * « ce qu'il reste à faire aujourd'hui », pas un rendez-vous manqué.
   * Une liste déjà en retard peut garder son jour — on en change le titre,
   * pas la date — mais on ne lui en assigne pas un autre déjà révolu.
   */
  private async assertDueNotPast(
    userId: string,
    dueAt: string | null | undefined,
    accessToken: string,
    currentDueAt?: string | null,
  ): Promise<void> {
    if (dueAt === null || dueAt === undefined) return;

    const timezone = await this.timezoneOf(userId, accessToken);
    if (!isPastCalendarDay(dueAt, timezone)) return;
    if (currentDueAt && isSameCalendarDay(dueAt, currentDueAt, timezone)) return;

    throw httpError(400, "Une échéance ne peut pas être dans le passé.");
  }
}
