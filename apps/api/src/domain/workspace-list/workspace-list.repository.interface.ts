import type {
  TaskListKind,
  UpdateWorkspaceTask,
  WorkspaceTask,
  WorkspaceTaskList,
} from "@jc/domain";

/** Une tâche à créer, déjà validée par le service. */
export type NewWorkspaceTask = { title: string; assigneeId: string | null; position: number };

export type NewWorkspaceTaskList = {
  workspaceId: string;
  title: string;
  kind: TaskListKind;
  dueAt: string | null;
  dueAllDay: boolean | null;
  folderId: string | null;
  conversationId: string | null;
  tasks: NewWorkspaceTask[];
};

/**
 * Modification déjà résolue par le service : l'échéance et son moment vont
 * ensemble, `null` pour les effacer, une clé absente pour les laisser.
 */
export type WorkspaceListPatch = {
  title?: string;
  kind?: TaskListKind;
  folderId?: string | null;
  dueAt?: string | null;
  dueAllDay?: boolean | null;
};

export interface IWorkspaceListRepository {
  /** Fuseau du profil de `userId`, pour dater « aujourd'hui » comme lui. */
  findTimezone(userId: string, accessToken: string): Promise<string>;
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
  update(id: string, patch: WorkspaceListPatch, accessToken: string): Promise<void>;
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
  /** Range les tâches de la liste dans l'ordre donné : la première prend la position 0. */
  setTaskPositions(listId: string, taskIds: string[], accessToken: string): Promise<void>;
}
