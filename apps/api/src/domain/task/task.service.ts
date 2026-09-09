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
import { userPreferencesSchema } from "@jc/domain";
import { httpError } from "../../core/http.js";
import { logger } from "../../core/logger.js";
import { hasWallTime } from "../../core/timezone.js";
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

  createList(
    userId: string,
    input: CreateTaskList & TaskListOrigin,
    accessToken: string,
  ): Promise<TaskList> {
    return this.lists.createList(userId, input, accessToken);
  }

  /**
   * Modifie une liste, en répercutant l'échéance sur le rendez-vous qu'elle
   * représente déjà, quand elle en porte un (A.3).
   *
   * Sens inverse de `CalendarService.syncLinkedTaskList` : sans lui, la fiche
   * du rendez-vous et l'échéance de la liste divergent en silence dès qu'on
   * modifie l'une des deux indépendamment de l'autre.
   */
  async updateList(
    userId: string,
    id: string,
    patch: UpdateTaskList,
    accessToken: string,
  ): Promise<TaskList> {
    const existing = await this.requireList(id, accessToken);
    const updated = await this.lists.updateList(id, patch, accessToken);

    if (patch.dueAt !== undefined && patch.dueAt !== null && existing.eventId !== null) {
      await this.syncLinkedEvent(userId, existing.eventId, patch.dueAt, accessToken);
    }

    return updated;
  }

  /**
   * Répercute la nouvelle échéance d'une liste sur son rendez-vous lié.
   *
   * `allDay` est dérivé de l'heure murale du profil — minuit vaut « dans la
   * journée », une heure précise vaut un rendez-vous à heure fixe — même
   * convention que côté client (`momentOf`, `TaskListDialog`).
   */
  private async syncLinkedEvent(
    userId: string,
    eventId: string,
    dueAt: string,
    accessToken: string,
  ): Promise<void> {
    try {
      const profile = await this.users.findById(userId, accessToken);
      const timezone = profile?.preferences.timezone ?? DEFAULT_TIMEZONE;
      await this.events.update(
        eventId,
        { startsAt: dueAt, allDay: !hasWallTime(dueAt, timezone) },
        accessToken,
      );
    } catch (error) {
      // Le rendez-vous a pu disparaître entre-temps : la liste garde sa
      // nouvelle échéance, seule leur synchronisation échoue.
      logger.warn(
        SCOPE,
        "Synchronisation du rendez-vous lié impossible :",
        error instanceof Error ? error.message : error,
      );
    }
  }

  async deleteList(id: string, accessToken: string): Promise<void> {
    await this.requireList(id, accessToken);
    await this.lists.deleteList(id, accessToken);
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
   */
  async replaceTasks(
    userId: string,
    listId: string,
    input: ReplaceTasks,
    accessToken: string,
  ): Promise<Task[]> {
    const list = await this.requireList(listId, accessToken);
    const known = new Set(list.tasks.map((task) => task.id));

    const rows: TaskRowInput[] = [];
    let parentId: string | null = null;

    input.items.forEach((item, position) => {
      // Un identifiant venu d'une autre liste rattacherait une tâche étrangère
      // à celle-ci : il est traité comme une ligne nouvelle.
      const id = item.id && known.has(item.id) ? item.id : randomUUID();
      const nested = item.depth > 0 && parentId !== null;

      rows.push({ id, title: item.title, parentId: nested ? parentId : null, position });
      if (!nested) parentId = id;
    });

    return this.lists.replaceTasks(userId, listId, rows, accessToken);
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
}
