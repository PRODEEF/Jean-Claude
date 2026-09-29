import type {
  CreateWorkspaceTask,
  CreateWorkspaceTaskList,
  UpdateWorkspaceTask,
  UpdateWorkspaceTaskList,
  WorkspaceTask,
  WorkspaceTaskList,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import type { IWorkspaceListRepository } from "./workspace-list.repository.interface.js";

/**
 * Listes partagées d'un espace : tout membre crée, coche, confie et supprime.
 *
 * La base tient déjà le responsable dans l'espace et le dossier dans l'espace
 * (triggers) ; le service le vérifie avant pour rendre un message clair
 * plutôt qu'une erreur Postgres.
 */
export class WorkspaceListService {
  constructor(private readonly lists: IWorkspaceListRepository) {}

  async list(
    workspaceId: string,
    userId: string,
    accessToken: string,
  ): Promise<WorkspaceTaskList[]> {
    await this.requireWorkspaceMembers(workspaceId, userId, accessToken);
    return this.lists.findByWorkspace(workspaceId, accessToken);
  }

  async get(id: string, accessToken: string): Promise<WorkspaceTaskList> {
    const list = await this.lists.findById(id, accessToken);
    if (!list) throw httpError(404, "Liste introuvable.");
    return list;
  }

  /**
   * `conversationId` n'appartient pas à `CreateWorkspaceTaskList` : il est posé
   * par le serveur quand une proposition de Jean-Claude est acceptée, jamais
   * accepté d'un client.
   */
  async create(
    userId: string,
    input: CreateWorkspaceTaskList & { conversationId?: string | null },
    accessToken: string,
  ): Promise<WorkspaceTaskList> {
    const members = await this.requireWorkspaceMembers(input.workspaceId, userId, accessToken);
    input.tasks.forEach((task) => assertAssignee(task.assigneeId ?? null, members));
    if (input.folderId) await this.assertFolder(input.workspaceId, input.folderId, accessToken);

    return this.lists.create(
      userId,
      {
        workspaceId: input.workspaceId,
        title: input.title,
        folderId: input.folderId ?? null,
        conversationId: input.conversationId ?? null,
        tasks: input.tasks.map((task, position) => ({
          title: task.title,
          assigneeId: task.assigneeId ?? null,
          position,
        })),
      },
      accessToken,
    );
  }

  async update(
    id: string,
    patch: UpdateWorkspaceTaskList,
    accessToken: string,
  ): Promise<WorkspaceTaskList> {
    const list = await this.get(id, accessToken);
    if (patch.folderId) await this.assertFolder(list.workspaceId, patch.folderId, accessToken);

    await this.lists.update(id, patch, accessToken);
    return {
      ...list,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.folderId !== undefined ? { folderId: patch.folderId } : {}),
    };
  }

  async delete(id: string, accessToken: string): Promise<void> {
    await this.get(id, accessToken);
    await this.lists.delete(id, accessToken);
  }

  async addTask(
    userId: string,
    listId: string,
    input: CreateWorkspaceTask,
    accessToken: string,
  ): Promise<WorkspaceTask> {
    const list = await this.get(listId, accessToken);
    const assigneeId = input.assigneeId ?? null;
    if (assigneeId) {
      assertAssignee(
        assigneeId,
        await this.lists.findWorkspaceMemberIds(list.workspaceId, accessToken),
      );
    }

    // En fin de liste : une tâche ajoutée à la main vient après les autres.
    const position = Math.max(-1, ...list.tasks.map((task) => task.position)) + 1;
    return this.lists.addTask(
      userId,
      listId,
      { title: input.title, assigneeId, position },
      accessToken,
    );
  }

  async updateTask(
    listId: string,
    taskId: string,
    patch: UpdateWorkspaceTask,
    accessToken: string,
  ): Promise<WorkspaceTask> {
    const list = await this.get(listId, accessToken);
    requireTask(list, taskId);
    if (patch.assigneeId) {
      assertAssignee(
        patch.assigneeId,
        await this.lists.findWorkspaceMemberIds(list.workspaceId, accessToken),
      );
    }

    return this.lists.updateTask(taskId, patch, accessToken);
  }

  async deleteTask(listId: string, taskId: string, accessToken: string): Promise<void> {
    requireTask(await this.get(listId, accessToken), taskId);
    await this.lists.deleteTask(taskId, accessToken);
  }

  /** Un non-membre reçoit un 404 : il n'a pas à apprendre que l'espace existe. */
  private async requireWorkspaceMembers(
    workspaceId: string,
    userId: string,
    accessToken: string,
  ): Promise<string[]> {
    const members = await this.lists.findWorkspaceMemberIds(workspaceId, accessToken);
    if (!members.includes(userId)) throw httpError(404, "Espace introuvable.");
    return members;
  }

  private async assertFolder(workspaceId: string, folderId: string, accessToken: string) {
    const folders = await this.lists.findWorkspaceFolderIds(workspaceId, accessToken);
    if (!folders.includes(folderId)) {
      throw httpError(400, "Ce dossier n'appartient pas à l'espace.");
    }
  }
}

function assertAssignee(assigneeId: string | null, members: string[]): void {
  if (assigneeId && !members.includes(assigneeId)) {
    throw httpError(400, "Le responsable choisi ne fait pas partie de l'espace.");
  }
}

function requireTask(list: WorkspaceTaskList, taskId: string): WorkspaceTask {
  const task = list.tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw httpError(404, "Tâche introuvable.");
  return task;
}
