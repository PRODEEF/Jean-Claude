import type { CreateTask, CreateTaskList, Task, TaskList, TaskListWithTasks } from "@jc/domain";
import { httpError } from "../../core/http.js";
import { forUser } from "../../core/supabase/supabase.js";
import type {
  ITaskRepository,
  TaskListOrigin,
  TaskListPatch,
  TaskPatch,
  TaskRowInput,
} from "./task.repository.interface.js";

/** Ligne Postgres — snake_case, telle que renvoyée par Supabase. */
type TaskListRow = {
  id: string;
  title: string;
  kind: string;
  due_at: string | null;
  event_id: string | null;
  conversation_id: string | null;
  folder_id: string | null;
  created_by_assistant: boolean;
  created_at: string;
  updated_at: string;
};

type TaskRow = {
  id: string;
  list_id: string;
  title: string;
  notes: string | null;
  done: boolean;
  completed_at: string | null;
  parent_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

function toList(row: TaskListRow): TaskList {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind as TaskList["kind"],
    dueAt: row.due_at,
    eventId: row.event_id,
    conversationId: row.conversation_id,
    folderId: row.folder_id,
    createdByAssistant: row.created_by_assistant,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    listId: row.list_id,
    title: row.title,
    notes: row.notes,
    done: row.done,
    completedAt: row.completed_at,
    parentId: row.parent_id,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Le tri des tâches se fait ici plutôt que dans la requête : PostgREST
 * n'ordonne pas les lignes imbriquées de la même façon selon la version, et
 * l'ordre d'une liste est ce qui la rend lisible.
 */
function toListWithTasks(row: TaskListRow & { tasks: TaskRow[] }): TaskListWithTasks {
  return {
    ...toList(row),
    tasks: [...row.tasks].sort((a, b) => a.position - b.position).map(toTask),
  };
}

const LIST_COLUMNS =
  "id, title, kind, due_at, event_id, conversation_id, folder_id, created_by_assistant, created_at, updated_at";
const TASK_COLUMNS =
  "id, list_id, title, notes, done, completed_at, parent_id, position, created_at, updated_at";
const LIST_WITH_TASKS_COLUMNS = `${LIST_COLUMNS}, tasks(${TASK_COLUMNS})`;

export const taskRepository: ITaskRepository = {
  async findAll(accessToken, options) {
    let query = forUser(accessToken)
      .from("task_lists")
      .select(LIST_WITH_TASKS_COLUMNS)
      .order("updated_at", { ascending: false })
      // Une ligne de plus que demandé : la présence du surplus indique qu'il
      // reste des résultats, sans requête `count` supplémentaire.
      .limit(options.limit + 1);

    if (options.cursor) query = query.lt("updated_at", options.cursor);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data as unknown as (TaskListRow & { tasks: TaskRow[] })[];
    const hasMore = rows.length > options.limit;
    const page = hasMore ? rows.slice(0, options.limit) : rows;

    return {
      items: page.map(toListWithTasks),
      nextCursor: hasMore ? (page[page.length - 1]?.updated_at ?? null) : null,
    };
  },

  async findById(id, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("task_lists")
      .select(LIST_WITH_TASKS_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toListWithTasks(data as unknown as TaskListRow & { tasks: TaskRow[] }) : null;
  },

  async findByConversation(conversationId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("task_lists")
      .select(LIST_WITH_TASKS_COLUMNS)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data as unknown as (TaskListRow & { tasks: TaskRow[] })[]).map(toListWithTasks);
  },

  async findByEventId(eventId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("task_lists")
      .select(LIST_COLUMNS)
      .eq("event_id", eventId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toList(data as unknown as TaskListRow) : null;
  },

  async createList(userId, input: CreateTaskList & TaskListOrigin, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("task_lists")
      .insert({
        user_id: userId,
        title: input.title,
        kind: input.kind,
        due_at: input.dueAt ?? null,
        folder_id: input.folderId ?? null,
        conversation_id: input.conversationId ?? null,
        created_by_assistant: input.createdByAssistant ?? false,
      })
      .select(LIST_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return toList(data as unknown as TaskListRow);
  },

  async updateList(id, patch: TaskListPatch, accessToken) {
    // Un `undefined` laisse la colonne intacte ; un `null` explicite l'efface —
    // sortir une liste de son dossier ou lui retirer son échéance, par exemple.
    const payload: Record<string, unknown> = {};
    if (patch.title !== undefined) payload["title"] = patch.title;
    if (patch.kind !== undefined) payload["kind"] = patch.kind;
    if (patch.folderId !== undefined) payload["folder_id"] = patch.folderId;
    if (patch.dueAt !== undefined) payload["due_at"] = patch.dueAt;
    if (patch.eventId !== undefined) payload["event_id"] = patch.eventId;

    const { data, error } = await forUser(accessToken)
      .from("task_lists")
      .update(payload)
      .eq("id", id)
      .select(LIST_COLUMNS)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw httpError(404, "Liste introuvable.");
    return toList(data as unknown as TaskListRow);
  },

  async deleteList(id, accessToken) {
    const { error } = await forUser(accessToken).from("task_lists").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async createTask(userId, listId, input: CreateTask, position, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("tasks")
      .insert({
        user_id: userId,
        list_id: listId,
        title: input.title,
        notes: input.notes ?? null,
        parent_id: input.parentId ?? null,
        position,
      })
      .select(TASK_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return toTask(data as unknown as TaskRow);
  },

  async updateTask(listId, taskId, patch: TaskPatch, accessToken) {
    const payload: Record<string, unknown> = {};
    if (patch.title !== undefined) payload["title"] = patch.title;
    if (patch.notes !== undefined) payload["notes"] = patch.notes;
    if (patch.done !== undefined) payload["done"] = patch.done;
    if (patch.completedAt !== undefined) payload["completed_at"] = patch.completedAt;
    if (patch.position !== undefined) payload["position"] = patch.position;
    if (patch.parentId !== undefined) payload["parent_id"] = patch.parentId;

    const { data, error } = await forUser(accessToken)
      .from("tasks")
      .update(payload)
      // Filtré sur les deux : une tâche ne se modifie que depuis sa liste.
      .eq("list_id", listId)
      .eq("id", taskId)
      .select(TASK_COLUMNS)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw httpError(404, "Tâche introuvable.");
    return toTask(data as unknown as TaskRow);
  },

  async deleteTask(listId, taskId, accessToken) {
    const { error } = await forUser(accessToken)
      .from("tasks")
      .delete()
      .eq("list_id", listId)
      .eq("id", taskId);

    if (error) throw new Error(error.message);
  },

  /**
   * Écriture puis suppression, dans cet ordre.
   *
   * Une tâche retirée emporte ses sous-tâches par cascade. Supprimer d'abord
   * effacerait donc une sous-tâche que l'éditeur a en réalité remontée d'un
   * niveau — elle est dans `rows`, mais son ancien parent, lui, n'y est plus.
   * L'`upsert` la détache avant que la cascade puisse l'atteindre.
   *
   * Deux requêtes et non quatre : ce qui était à conserver et ce qui était à
   * effacer se lisait ici dans une liste que le service venait déjà de charger,
   * et l'`upsert` rend les lignes écrites — il n'y a pas à les relire.
   */
  async replaceTasks(userId, listId, content, accessToken) {
    const client = forUser(accessToken);
    const written: Task[] = [];

    if (content.rows.length > 0) {
      const payload = content.rows.map((row: TaskRowInput) => ({
        id: row.id,
        user_id: userId,
        list_id: listId,
        title: row.title,
        parent_id: row.parentId,
        position: row.position,
        notes: row.notes,
        done: row.done,
        completed_at: row.completedAt,
      }));

      const { data, error } = await client.from("tasks").upsert(payload).select(TASK_COLUMNS);
      if (error) throw new Error(error.message);
      written.push(...(data as unknown as TaskRow[]).map(toTask));
    }

    if (content.removed.length > 0) {
      const { error } = await client
        .from("tasks")
        .delete()
        .eq("list_id", listId)
        .in("id", content.removed);

      if (error) throw new Error(error.message);
    }

    // PostgREST ne garantit pas de rendre les lignes dans l'ordre où elles lui
    // sont envoyées, et l'ordre d'une liste est ce qui la rend lisible.
    return written.sort((a, b) => a.position - b.position);
  },
};
