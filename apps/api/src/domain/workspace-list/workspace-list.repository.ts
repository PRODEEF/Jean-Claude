import type { WorkspaceTask, WorkspaceTaskList } from "@jc/domain";
import { forUser } from "../../core/supabase/supabase.js";
import type { IWorkspaceListRepository } from "./workspace-list.repository.interface.js";

/** Lignes Postgres — snake_case, telles que renvoyées par Supabase. */
type TaskRow = {
  id: string;
  list_id: string;
  title: string;
  done: boolean;
  assignee_id: string | null;
  position: number;
  created_at: string;
};

type ListRow = {
  id: string;
  workspace_id: string;
  title: string;
  folder_id: string | null;
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
  workspace_tasks: TaskRow[] | null;
};

function toTask(row: TaskRow): WorkspaceTask {
  return {
    id: row.id,
    listId: row.list_id,
    title: row.title,
    done: row.done,
    assigneeId: row.assignee_id,
    position: row.position,
    createdAt: row.created_at,
  };
}

function toList(row: ListRow): WorkspaceTaskList {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    folderId: row.folder_id,
    conversationId: row.conversation_id,
    tasks: (row.workspace_tasks ?? [])
      .map(toTask)
      .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const TASK_COLUMNS = "id, list_id, title, done, assignee_id, position, created_at";
const LIST_COLUMNS = `id, workspace_id, title, folder_id, conversation_id, created_at, updated_at, workspace_tasks(${TASK_COLUMNS})`;

export const workspaceListRepository: IWorkspaceListRepository = {
  async findWorkspaceMemberIds(workspaceId, accessToken) {
    const { data, error } = await forUser(accessToken).rpc("workspace_member_profiles", {
      p_workspace: workspaceId,
    });

    if (error) throw new Error(error.message);
    return (data as unknown as { user_id: string }[]).map((row) => row.user_id);
  },

  async findWorkspaceFolderIds(workspaceId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("folders")
      .select("id")
      .eq("workspace_id", workspaceId);

    if (error) throw new Error(error.message);
    return (data as { id: string }[]).map((row) => row.id);
  },

  async findByWorkspace(workspaceId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_task_lists")
      .select(LIST_COLUMNS)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data as unknown as ListRow[]).map(toList);
  },

  async findById(id, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_task_lists")
      .select(LIST_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toList(data as unknown as ListRow) : null;
  },

  async create(userId, list, accessToken) {
    const client = forUser(accessToken);
    const { data, error } = await client
      .from("workspace_task_lists")
      .insert({
        workspace_id: list.workspaceId,
        title: list.title,
        folder_id: list.folderId,
        conversation_id: list.conversationId,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;

    if (list.tasks.length > 0) {
      const { error: tasksError } = await client.from("workspace_tasks").insert(
        list.tasks.map((task) => ({
          list_id: id,
          title: task.title,
          assignee_id: task.assigneeId,
          position: task.position,
          created_by: userId,
        })),
      );
      if (tasksError) throw new Error(tasksError.message);
    }

    const created = await this.findById(id, accessToken);
    if (!created) throw new Error("Liste introuvable juste après sa création.");
    return created;
  },

  async update(id, patch, accessToken) {
    const payload: Record<string, unknown> = {};
    if (patch.title !== undefined) payload["title"] = patch.title;
    if (patch.folderId !== undefined) payload["folder_id"] = patch.folderId;

    const { error } = await forUser(accessToken)
      .from("workspace_task_lists")
      .update(payload)
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  async delete(id, accessToken) {
    const { error } = await forUser(accessToken).from("workspace_task_lists").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async addTask(userId, listId, task, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_tasks")
      .insert({
        list_id: listId,
        title: task.title,
        assignee_id: task.assigneeId,
        position: task.position,
        created_by: userId,
      })
      .select(TASK_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return toTask(data as unknown as TaskRow);
  },

  async updateTask(taskId, patch, accessToken) {
    // Clé par clé : un `undefined` laisse la colonne intacte, un `null` efface
    // le responsable.
    const payload: Record<string, unknown> = {};
    if (patch.title !== undefined) payload["title"] = patch.title;
    if (patch.assigneeId !== undefined) payload["assignee_id"] = patch.assigneeId;
    if (patch.done !== undefined) {
      payload["done"] = patch.done;
      payload["completed_at"] = patch.done ? new Date().toISOString() : null;
    }

    const { data, error } = await forUser(accessToken)
      .from("workspace_tasks")
      .update(payload)
      .eq("id", taskId)
      .select(TASK_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return toTask(data as unknown as TaskRow);
  },

  async deleteTask(taskId, accessToken) {
    const { error } = await forUser(accessToken).from("workspace_tasks").delete().eq("id", taskId);
    if (error) throw new Error(error.message);
  },
};
