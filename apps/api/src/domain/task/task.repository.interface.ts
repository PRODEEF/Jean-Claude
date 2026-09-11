import type {
  CreateTask,
  CreateTaskList,
  Paginated,
  Task,
  TaskList,
  TaskListWithTasks,
  UpdateTask,
  UpdateTaskList,
} from "@jc/domain";

/**
 * Modification d'une tâche telle qu'elle atteint la base.
 *
 * `completedAt` s'ajoute à ce que le client peut envoyer : l'horodatage de
 * complétion est déduit du passage de `done`, jamais posé par l'appelant.
 */
export type TaskPatch = UpdateTask & { completedAt?: string | null };

/**
 * Modification d'une liste telle qu'elle atteint la base.
 *
 * `eventId` s'ajoute à ce que le client peut envoyer : le lien vers le créneau
 * de l'agenda naît d'une proposition acceptée (A.3), jamais d'un appel direct.
 *
 * `dueAllDay` y est élargi à `null` : le client ne sait dire que « la journée »
 * ou « un créneau », alors que l'absence d'échéance doit aussi effacer son
 * moment — les deux colonnes vont ensemble, et la base le vérifie.
 */
export type TaskListPatch = Omit<UpdateTaskList, "dueAllDay"> & {
  eventId?: string | null;
  dueAllDay?: boolean | null | undefined;
};

/**
 * Création d'une liste telle qu'elle atteint la base.
 *
 * Même élargissement de `dueAllDay` que pour la modification, et pour la même
 * raison : une liste sans échéance n'a pas de moment.
 */
export type TaskListCreate = Omit<CreateTaskList, "dueAllDay"> &
  TaskListOrigin & { dueAllDay?: boolean | null | undefined };

/**
 * Une ligne de l'éditeur, prête pour la base.
 *
 * La filiation y est déjà résolue : le service traduit la profondeur envoyée
 * par l'éditeur en `parentId`, le Repository ne fait plus qu'écrire.
 *
 * La complétion et les notes y figurent alors que l'éditeur ne les transporte
 * pas : les conserver est une règle métier — cocher et écrire sont deux gestes
 * distincts, et taper une ligne ne doit pas décocher la voisine — donc elle est
 * tranchée par le service, à partir de la liste qu'il a déjà en main.
 */
export type TaskRowInput = {
  id: string;
  title: string;
  parentId: string | null;
  position: number;
  notes: string | null;
  done: boolean;
  completedAt: string | null;
};

/**
 * Ce qu'ajoute une liste née d'une proposition acceptée (§12.1, A.2).
 *
 * Hors de `CreateTaskList` comme `createdByAssistant` l'est de `CreateFolder` :
 * ces deux champs sont posés par le serveur, jamais acceptés d'un client — sans
 * quoi n'importe quel appel pourrait se faire passer pour l'assistant.
 */
export type TaskListOrigin = { conversationId?: string; createdByAssistant?: boolean };

export interface ITaskRepository {
  /**
   * Les listes de l'utilisateur, tâches comprises, tous dossiers confondus
   * (A.2), triées par dernière modification — même pagination par curseur
   * que les conversations, pour ne pas tout charger d'un coup à mesure que
   * le compte en accumule.
   */
  findAll(
    accessToken: string,
    options: { cursor?: string; limit: number },
  ): Promise<Paginated<TaskListWithTasks>>;
  findById(id: string, accessToken: string): Promise<TaskListWithTasks | null>;
  /** Listes nées d'une conversation donnée — celles que l'assistant peut compléter. */
  findByConversation(conversationId: string, accessToken: string): Promise<TaskListWithTasks[]>;
  /**
   * La liste rattachée au créneau donné, s'il en existe une (A.3).
   *
   * Un événement ne représente jamais plus d'une liste : sert à répercuter le
   * déplacement d'un rendez-vous sur l'échéance de la todoliste qui s'y
   * rattache, depuis `domain/calendar`.
   */
  findByEventId(eventId: string, accessToken: string): Promise<TaskList | null>;
  createList(userId: string, input: TaskListCreate, accessToken: string): Promise<TaskList>;
  updateList(id: string, patch: TaskListPatch, accessToken: string): Promise<TaskList>;
  deleteList(id: string, accessToken: string): Promise<void>;
  createTask(
    userId: string,
    listId: string,
    input: CreateTask,
    position: number,
    accessToken: string,
  ): Promise<Task>;
  /** Filtre aussi sur la liste : une tâche ne se modifie que depuis la sienne. */
  updateTask(listId: string, taskId: string, patch: TaskPatch, accessToken: string): Promise<Task>;
  deleteTask(listId: string, taskId: string, accessToken: string): Promise<void>;
  /**
   * Réécrit le contenu d'une liste.
   *
   * `rows` est écrit tel quel, `removed` disparaît. Les deux sont calculés par
   * le service, qui tient déjà la liste : le Repository n'a donc pas à la
   * relire pour savoir ce qu'il efface.
   */
  replaceTasks(
    userId: string,
    listId: string,
    content: { rows: TaskRowInput[]; removed: string[] },
    accessToken: string,
  ): Promise<Task[]>;
}
