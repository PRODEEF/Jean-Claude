import { admin } from "../../core/supabase/supabase.js";
import type {
  IReminderRepository,
  ReminderChannel,
  ReminderRecipient,
} from "./reminder.repository.interface.js";
import type { ReminderEvent, RemindableList } from "./reminder-schedule.js";

/** Ligne Postgres d'un rendez-vous, avec son propriétaire. */
type EventRow = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  rrule: string | null;
  reminder_minutes_before: number | null;
  folder_id: string | null;
  conversation_id: string | null;
  created_by_assistant: boolean;
  created_at: string;
  updated_at: string;
};

/** Ligne Postgres d'une liste datée, avec son propriétaire. */
type ListRow = {
  id: string;
  user_id: string;
  title: string;
  kind: "todo" | "shopping";
  due_at: string | null;
  due_all_day: boolean | null;
  ends_at: string | null;
  rrule: string | null;
  reminder_minutes_before: number | null;
  done_at: string | null;
  notes: string | null;
  event_id: string | null;
  source_event_id: string | null;
  conversation_id: string | null;
  folder_id: string | null;
  created_by_assistant: boolean;
  created_at: string;
  updated_at: string;
};

const LIST_COLUMNS =
  "id, user_id, title, kind, due_at, due_all_day, ends_at, rrule, reminder_minutes_before, done_at, notes, event_id, source_event_id, conversation_id, folder_id, created_by_assistant, created_at, updated_at";

const EVENT_COLUMNS =
  "id, user_id, title, notes, starts_at, ends_at, all_day, rrule, reminder_minutes_before, folder_id, conversation_id, created_by_assistant, created_at, updated_at";

/** Code Postgres d'une violation de contrainte d'unicité. */
const UNIQUE_VIOLATION = "23505";

function toReminderEvent(row: EventRow): ReminderEvent {
  return {
    userId: row.user_id,
    id: row.id,
    title: row.title,
    notes: row.notes,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    rrule: row.rrule,
    reminderMinutesBefore: row.reminder_minutes_before,
    folderId: row.folder_id,
    conversationId: row.conversation_id,
    createdByAssistant: row.created_by_assistant,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Seul Repository à utiliser `admin` : le planificateur n'a pas d'utilisateur
 * derrière lui, il agit pour tous. Aucune route d'utilisateur ne l'appelle.
 */
export const reminderRepository: IReminderRepository = {
  async findRemindable(from, to) {
    const { data, error } = await admin
      .from("calendar_events")
      .select(EVENT_COLUMNS)
      .not("reminder_minutes_before", "is", null)
      .lte("starts_at", to.toISOString())
      // Une série commencée avant la fenêtre en est aussi : ses occurrences se
      // calculent ensuite. Les guillemets protègent les points de l'horodatage.
      .or(`rrule.not.is.null,starts_at.gte."${from.toISOString()}"`);

    if (error) throw new Error(error.message);
    return (data as unknown as EventRow[]).map(toReminderEvent);
  },

  async findRemindableLists(from, to) {
    const { data, error } = await admin
      .from("task_lists")
      .select(LIST_COLUMNS)
      .not("reminder_minutes_before", "is", null)
      .not("due_at", "is", null)
      .lte("due_at", to.toISOString())
      .or(`rrule.not.is.null,due_at.gte."${from.toISOString()}"`);

    if (error) throw new Error(error.message);
    const rows = data as unknown as ListRow[];

    // Un rendez-vous encore présent rappelle déjà : sa copie en liste se tait.
    const sourceIds = rows.flatMap((row) => (row.source_event_id ? [row.source_event_id] : []));
    const stillThere = new Set<string>();
    if (sourceIds.length > 0) {
      const { data: events, error: eventsError } = await admin
        .from("calendar_events")
        .select("id")
        .in("id", sourceIds);
      if (eventsError) throw new Error(eventsError.message);
      for (const event of events as unknown as { id: string }[]) stillThere.add(event.id);
    }
    const remindable = rows.filter(
      (row) => row.source_event_id === null || !stillThere.has(row.source_event_id),
    );

    const seriesIds = remindable.filter((row) => row.rrule !== null).map((row) => row.id);
    const overrides = new Map<string, RemindableList["overrides"]>();
    if (seriesIds.length > 0) {
      const { data: exceptions, error: exceptionsError } = await admin
        .from("task_list_occurrences")
        .select("list_id, occurrence_at, done_at, moved_to, cancelled")
        .in("list_id", seriesIds);
      if (exceptionsError) throw new Error(exceptionsError.message);
      for (const row of exceptions as unknown as {
        list_id: string;
        occurrence_at: string;
        done_at: string | null;
        moved_to: string | null;
        cancelled: boolean;
      }[]) {
        overrides.set(row.list_id, [
          ...(overrides.get(row.list_id) ?? []),
          {
            occurrenceAt: row.occurrence_at,
            doneAt: row.done_at,
            movedTo: row.moved_to,
            cancelled: row.cancelled,
          },
        ]);
      }
    }

    return remindable.map((row) => ({
      list: {
        userId: row.user_id,
        id: row.id,
        title: row.title,
        kind: row.kind,
        dueAt: row.due_at,
        dueAllDay: row.due_all_day,
        endsAt: row.ends_at,
        rrule: row.rrule,
        reminderMinutesBefore: row.reminder_minutes_before,
        doneAt: row.done_at,
        notes: row.notes,
        eventId: row.event_id,
        conversationId: row.conversation_id,
        folderId: row.folder_id,
        createdByAssistant: row.created_by_assistant,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      overrides: overrides.get(row.id) ?? [],
    }));
  },

  async claimList(listId, occurrenceAt, channel) {
    const { error } = await admin
      .from("task_list_reminders_sent")
      .insert({ list_id: listId, occurrence_at: occurrenceAt, channel });

    if (!error) return true;
    if (error.code === UNIQUE_VIOLATION) return false;
    throw new Error(error.message);
  },

  async releaseList(listId, occurrenceAt, channel) {
    const { error } = await admin
      .from("task_list_reminders_sent")
      .delete()
      .eq("list_id", listId)
      .eq("occurrence_at", occurrenceAt)
      .eq("channel", channel);

    if (error) throw new Error(error.message);
  },

  async findRecipients(userIds) {
    if (userIds.length === 0) return [];

    const { data, error } = await admin
      .from("profiles")
      .select("id, timezone, remind_in_channel, remind_by_email")
      .in("id", userIds);

    if (error) throw new Error(error.message);
    const rows = data as unknown as {
      id: string;
      timezone: string;
      remind_in_channel: boolean;
      remind_by_email: boolean;
    }[];

    return Promise.all(
      rows.map(async (row): Promise<ReminderRecipient> => ({
        userId: row.id,
        timezone: row.timezone,
        remindInChannel: row.remind_in_channel,
        remindByEmail: row.remind_by_email,
        // L'adresse n'est lue que pour qui veut un e-mail.
        email: row.remind_by_email ? await emailOf(row.id) : null,
      })),
    );
  },

  async claim(eventId, occurrenceAt, channel) {
    const { error } = await admin
      .from("reminders_sent")
      .insert({ event_id: eventId, occurrence_at: occurrenceAt, channel });

    if (!error) return true;
    if (error.code === UNIQUE_VIOLATION) return false;
    throw new Error(error.message);
  },

  async release(eventId, occurrenceAt, channel) {
    const { error } = await admin
      .from("reminders_sent")
      .delete()
      .eq("event_id", eventId)
      .eq("occurrence_at", occurrenceAt)
      .eq("channel", channel);

    if (error) throw new Error(error.message);
  },

  async postInChannel(userId, content) {
    const channelId = await assistantChannelOf(userId);

    const { error } = await admin
      .from("messages")
      .insert({ conversation_id: channelId, user_id: userId, role: "assistant", content });

    if (error) throw new Error(error.message);
  },
};

/** Adresse de connexion : elle n'existe que dans `auth.users`, d'où l'API d'administration. */
async function emailOf(userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) throw new Error(error.message);
  return data.user?.email ?? null;
}

/**
 * Canal permanent de l'utilisateur, créé s'il n'existe pas encore — un rappel
 * peut arriver avant qu'il ait jamais ouvert le canal.
 */
async function assistantChannelOf(userId: string): Promise<string> {
  const existing = await findChannel(userId);
  if (existing) return existing;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("assistant_name")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);

  const { data, error } = await admin
    .from("conversations")
    .insert({
      user_id: userId,
      kind: "assistant",
      title: (profile as { assistant_name?: string } | null)?.assistant_name ?? "Jean-Claude",
    })
    .select("id")
    .single();

  if (!error) return (data as { id: string }).id;
  // Un autre appel l'a créé entre-temps : le canal est unique par utilisateur.
  if (error.code === UNIQUE_VIOLATION) {
    const created = await findChannel(userId);
    if (created) return created;
  }
  throw new Error(error.message);
}

async function findChannel(userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "assistant")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? (data as { id: string }).id : null;
}
