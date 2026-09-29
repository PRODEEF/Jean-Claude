import type {
  UpdateWorkspaceTask,
  UpdateWorkspaceTaskList,
  WorkspaceTask,
  WorkspaceTaskList,
} from "@jc/domain";

/** Une tâche à créer, déjà validée par le service. */
export type NewWorkspaceTask = { title: string; assigneeId: string | null; position: number };

export type NewWorkspaceTaskList = {
  workspaceId: string;
  title: string;
  folderId: string | null;
  conversationId: string | null;
  tasks: NewWorkspaceTask[];
};

export interface IWorkspaceListRepository {
  /** Membres de l'espace ; vide si l'appelant n'en fait pas partie. */
  findWorkspaceMemberIds(workspaceId: string, accessToken: string): Promise<string[]>;
  /** Dossiers de l'espace ; vide pour qui n'en est pas membre. */
  findWorkspaceFolderIds(workspaceId: string, accessToken: string): Promise<string[]>;
  /** Listes de l'espace, tâches comprises, de la plus récente à la plus ancienne. */
  findByWorkspace(workspaceId: string, accessToken: string): Promise<WorkspaceTaskList[]>;
  /** `null` si la liste n'existe pas ou si l'appelant n'est pas membre de son espace. */
  findById(id: string, accessToken: string): Promise<WorkspaceTaskList | null>;
  create(
    userId: string,
    list: NewWorkspaceTaskList,
    accessToken: string,
  ): Promise<WorkspaceTaskList>;
  update(id: string, patch: UpdateWorkspaceTaskList, accessToken: string): Promise<void>;
  delete(id: string, accessToken: string): Promise<void>;
  addTask(
    userId: string,
    listId: string,
    task: NewWorkspaceTask,
    accessToken: string,
  ): Promise<WorkspaceTask>;
  updateTask(
    taskId: string,
    patch: UpdateWorkspaceTask,
    accessToken: string,
  ): Promise<WorkspaceTask>;
  deleteTask(taskId: string, accessToken: string): Promise<void>;
}
