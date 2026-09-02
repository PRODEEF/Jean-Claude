import type {
  CreateTask,
  CreateTaskList,
  Task,
  TaskList,
  TaskListWithTasks,
  UpdateTask,
  UpdateTaskList,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import type { ITaskRepository, TaskListOrigin, TaskPatch } from "./task.repository.interface.js";

export class TaskService {
  constructor(private readonly lists: ITaskRepository) {}

  /**
   * Toutes les listes, tâches comprises.
   *
   * Pas de fenêtre temporelle ni de pagination : l'onglet TODOLISTE est
   * précisément la vue « tous dossiers confondus » (A.2), et la vue
   * hebdomadaire se dérive du même chargement. Deux routes auraient obligé à
   * recharger à chaque bascule entre la semaine et les listes.
   */
  list(accessToken: string): Promise<TaskListWithTasks[]> {
    return this.lists.findAll(accessToken);
  }

  createList(
    userId: string,
    input: CreateTaskList & TaskListOrigin,
    accessToken: string,
  ): Promise<TaskList> {
    return this.lists.createList(userId, input, accessToken);
  }

  async updateList(id: string, patch: UpdateTaskList, accessToken: string): Promise<TaskList> {
    await this.requireList(id, accessToken);
    return this.lists.updateList(id, patch, accessToken);
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
   * Rattache la tâche au créneau posé pour elle (A.3).
   *
   * Méthode à part de `updateTask` : `eventId` ne fait pas partie de ce qu'un
   * client peut modifier, et le calendrier s'appuie sur ce lien pour ne pas
   * afficher deux fois la même échéance — la tâche et son créneau.
   */
  async linkEvent(
    listId: string,
    taskId: string,
    eventId: string,
    accessToken: string,
  ): Promise<Task> {
    await this.requireTask(listId, taskId, accessToken);
    return this.lists.updateTask(listId, taskId, { eventId }, accessToken);
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
