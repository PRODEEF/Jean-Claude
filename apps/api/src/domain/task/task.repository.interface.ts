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

export interface ITaskRepository {
  /** Toutes les listes de l'utilisateur, tâches comprises, tous dossiers confondus (A.2). */
  findAll(accessToken: string): Promise<TaskListWithTasks[]>;
  findById(id: string, accessToken: string): Promise<TaskListWithTasks | null>;
  createList(userId: string, input: CreateTaskList, accessToken: string): Promise<TaskList>;
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
  updateTask(
    listId: string,
    taskId: string,
    patch: TaskPatch,
    accessToken: string,
  ): Promise<Task>;
  deleteTask(listId: string, taskId: string, accessToken: string): Promise<void>;
}
