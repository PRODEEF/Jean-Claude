import type { WorkspaceEvent } from "@jc/domain";
import { forUser } from "../../core/supabase/supabase.js";
import type {
  IWorkspaceEventRepository,
  WorkspaceEventWithSpace,
} from "./workspace-event.repository.interface.js";

/** Ligne Postgres — snake_case, telle que renvoyée par Supabase. */
type WorkspaceEventRow = {
  id: string;
  conversation_id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  reminder_minutes_before: number | null;
  created_by: string | null;
  created_by_assistant: boolean;
  created_at: string;
  updated_at: string;
};

type SpaceRow = {
  id: string;
  title: string;
  workspace_id: string;
  workspaces: { name: string } | null;
};

const COLUMNS =
  "id, conversation_id, title, notes, starts_at, ends_at, all_day, reminder_minutes_before, " +
  "created_by, created_by_assistant, created_at, updated_at";
const SPACE_COLUMNS = "id, title, workspace_id, workspaces(name)";

function toEntity(row: WorkspaceEventRow): WorkspaceEvent {
  return {
    id: row.id,
    groupId: row.conversation_id,
    title: row.title,
    notes: row.notes,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    reminderMinutesBefore: row.reminder_minutes_before,
    createdBy: row.created_by,
    createdByAssistant: row.created_by_assistant,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSpace(row: SpaceRow) {
  return {
    workspaceId: row.workspace_id,
    workspaceName: row.workspaces?.name ?? "",
    groupId: row.id,
    groupTitle: row.title,
  };
}

export const workspaceEventRepository: IWorkspaceEventRepository = {
  async findSpace(groupId, userId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("conversation_members")
      .select(`conversations!inner(${SPACE_COLUMNS})`)
      .eq("conversation_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    const row = (data as unknown as { conversations: SpaceRow | null } | null)?.conversations;
    return row ? toSpace(row) : null;
  },

  async findById(id, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_events")
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toEntity(data as unknown as WorkspaceEventRow) : null;
  },

  async findInRange(range, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_events")
      .select(`${COLUMNS}, conversations!inner(${SPACE_COLUMNS})`)
      // Même chevauchement que le calendrier personnel ; bornes entre
      // guillemets, PostgREST découpant un `or` sur `.` et `,`.
      .lt("starts_at", range.to)
      .or(`ends_at.gt."${range.from}",and(ends_at.is.null,starts_at.gte."${range.from}")`)
      .order("starts_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data as unknown as (WorkspaceEventRow & { conversations: SpaceRow })[]).map(
      (row): WorkspaceEventWithSpace => ({ ...toEntity(row), space: toSpace(row.conversations) }),
    );
  },

  async create(userId, input, createdByAssistant, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_events")
      .insert({
        conversation_id: input.groupId,
        title: input.title,
        notes: input.notes ?? null,
        starts_at: input.startsAt,
        ends_at: input.endsAt ?? null,
        all_day: input.allDay,
        reminder_minutes_before: input.reminderMinutesBefore ?? null,
        created_by: userId,
        created_by_assistant: createdByAssistant,
      })
      .select(COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return toEntity(data as unknown as WorkspaceEventRow);
  },

  async update(id, patch, accessToken) {
    // Un `undefined` laisse la colonne intacte, un `null` explicite l'efface.
    const payload: Record<string, unknown> = {};
    if (patch.title !== undefined) payload["title"] = patch.title;
    if (patch.notes !== undefined) payload["notes"] = patch.notes;
    if (patch.startsAt !== undefined) payload["starts_at"] = patch.startsAt;
    if (patch.endsAt !== undefined) payload["ends_at"] = patch.endsAt;
    if (patch.allDay !== undefined) payload["all_day"] = patch.allDay;
    if (patch.reminderMinutesBefore !== undefined) {
      payload["reminder_minutes_before"] = patch.reminderMinutesBefore;
    }

    const { data, error } = await forUser(accessToken)
      .from("workspace_events")
      .update(payload)
      .eq("id", id)
      .select(COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return toEntity(data as unknown as WorkspaceEventRow);
  },

  async delete(id, accessToken) {
    const { error } = await forUser(accessToken).from("workspace_events").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async findAuthor(userId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("profiles")
      .select("display_name, timezone")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    const row = data as { display_name: string | null; timezone: string } | null;
    return { displayName: row?.display_name ?? null, timezone: row?.timezone ?? "Europe/Paris" };
  },

  async appendSystemMessage(groupId, userId, content, accessToken) {
    const client = forUser(accessToken);
    const { data, error } = await client
      .from("messages")
      .insert({
        conversation_id: groupId,
        user_id: userId,
        role: "system",
        content,
        input_mode: "text",
      })
      .select("created_at")
      .single();
    if (error) throw new Error(error.message);

    // Comme un message ordinaire : la conversation remonte dans la liste.
    const { error: touchError } = await client
      .from("conversations")
      .update({ last_message_at: (data as { created_at: string }).created_at })
      .eq("id", groupId);
    if (touchError) throw new Error(touchError.message);
  },
};
