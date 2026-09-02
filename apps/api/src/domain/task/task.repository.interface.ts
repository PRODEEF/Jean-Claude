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
export type TaskPatch = UpdateTask & {
  completedAt?: string | null;
  /** Événement calendrier posé depuis la tâche (A.3) — jamais envoyé par un client. */
  eventId?: string | null;
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
  updateList(id: string, patch: UpdateTaskList, accessToken: string): Promise<TaskList>;
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
}
