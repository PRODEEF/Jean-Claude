import type {
  CreateTask,
  CreateTaskList,
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
 */
export type TaskListPatch = UpdateTaskList & { eventId?: string | null };

/**
 * Une ligne de l'éditeur, prête pour la base.
 *
 * La filiation y est déjà résolue : le service traduit la profondeur envoyée
 * par l'éditeur en `parentId`, le Repository ne fait plus qu'écrire.
 */
export type TaskRowInput = {
  id: string;
  title: string;
  parentId: string | null;
  position: number;
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
  /** Toutes les listes de l'utilisateur, tâches comprises, tous dossiers confondus (A.2). */
  findAll(accessToken: string): Promise<TaskListWithTasks[]>;
  findById(id: string, accessToken: string): Promise<TaskListWithTasks | null>;
  createList(
    userId: string,
    input: CreateTaskList & TaskListOrigin,
    accessToken: string,
  ): Promise<TaskList>;
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
   * Réécrit le contenu d'une liste en un appel.
   *
   * Les lignes absentes de `rows` disparaissent ; les autres sont écrites
   * telles quelles. Ce que l'éditeur ne transporte pas — `done`, `notes`,
   * l'horodatage de complétion — est conservé : cocher et écrire sont deux
   * gestes distincts, et taper une ligne ne doit pas décocher la voisine.
   */
  replaceTasks(
    userId: string,
    listId: string,
    rows: TaskRowInput[],
    accessToken: string,
  ): Promise<Task[]>;
}
