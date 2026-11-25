import type { CalendarEvent, TaskList } from "@jc/domain";
import { logger } from "../../core/logger.js";
import { admin } from "../../core/supabase/supabase.js";
import { occurrencesInRange } from "../../domain/calendar/occurrences.js";
import {
  listOccurrencesInRange,
  type OccurrenceOverride,
} from "../../domain/task/list-occurrences.js";
import { reminderRepository } from "../reminders/reminder.repository.js";
import type { BriefItem } from "./morning-brief.js";
import type {
  BriefRecipient,
  IMorningBriefRepository,
} from "./morning-brief.repository.interface.js";

/** Code Postgres d'une violation de contrainte d'unicité. */
const UNIQUE_VIOLATION = "23505";

type EventRow = {
  id: string;
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

type ListRow = {
  id: string;
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
  conversation_id: string | null;
  folder_id: string | null;
  created_by_assistant: boolean;
  created_at: string;
  updated_at: string;
};

const EVENT_COLUMNS =
  "id, title, notes, starts_at, ends_at, all_day, rrule, reminder_minutes_before, folder_id, conversation_id, created_by_assistant, created_at, updated_at";
const LIST_COLUMNS =
  "id, title, kind, due_at, due_all_day, ends_at, rrule, reminder_minutes_before, done_at, notes, event_id, conversation_id, folder_id, created_by_assistant, created_at, updated_at";

/**
 * Comme le planificateur de rappels, ce Repository utilise `admin` : il n'y a pas
 * d'utilisateur derrière. Aucune route d'utilisateur ne l'appelle.
 */
export const morningBriefRepository: IMorningBriefRepository = {
  async findRecipients() {
    const { data, error } = await admin
      .from("profiles")
      .select("id, assistant_scope, remind_in_channel")
      .eq("remind_in_channel", true);
    if (error) throw new Error(error.message);

    // Absent du jsonb, le réglage vaut son défaut : activé.
    const ids = (
      data as unknown as { id: string; assistant_scope: { morningReminders?: boolean } | null }[]
    )
      .filter((row) => row.assistant_scope?.morningReminders !== false)
      .map((row) => row.id);
    if (ids.length === 0) return [];

    const recipients = await reminderRepository.findRecipients(ids);
    return recipients.map((recipient): BriefRecipient => ({
      userId: recipient.userId,
      timezone: recipient.timezone,
      displayName: recipient.displayName,
      assistantName: recipient.assistantName,
      memory: recipient.memory,
    }));
  },

  async claim(userId, day) {
    const { error } = await admin.from("morning_briefs_sent").insert({ user_id: userId, day });

    if (!error) return true;
    if (error.code === UNIQUE_VIOLATION) return false;
    throw new Error(error.message);
  },

  async release(userId, day) {
    const { error } = await admin
      .from("morning_briefs_sent")
      .delete()
      .eq("user_id", userId)
      .eq("day", day);
    if (error) throw new Error(error.message);
  },

  async agendaOf(userId, from, to) {
    const range = { from: from.toISOString(), to: to.toISOString() };

    const { data: events, error: eventsError } = await admin
      .from("calendar_events")
      .select(EVENT_COLUMNS)
      .eq("user_id", userId)
      .lte("starts_at", range.to)
      .or(`rrule.not.is.null,starts_at.gte."${range.from}"`);
    if (eventsError) throw new Error(eventsError.message);

    const { data: lists, error: listsError } = await admin
      .from("task_lists")
      .select(LIST_COLUMNS)
      .eq("user_id", userId)
      .not("due_at", "is", null)
      .lte("due_at", range.to)
      .or(`rrule.not.is.null,due_at.gte."${range.from}"`);
    if (listsError) throw new Error(listsError.message);

    const listRows = lists as unknown as ListRow[];
    const overrides = await overridesOf(listRows.filter((row) => row.rrule !== null));
    // Une liste qui projette un rendez-vous apparaît déjà par lui : une seule ligne.
    const projected = new Set(listRows.flatMap((row) => (row.event_id ? [row.event_id] : [])));

    const items: BriefItem[] = [];
    for (const row of events as unknown as EventRow[]) {
      if (projected.has(row.id)) continue;
      for (const occurrence of occurrencesInRange(toEvent(row), range)) {
        // Une occurrence commencée la veille et qui se prolonge n'est pas « aujourd'hui ».
        if (occurrence.startsAt < range.from || occurrence.startsAt >= range.to) continue;
        items.push({
          startsAt: occurrence.startsAt,
          allDay: occurrence.allDay,
          title: row.title,
          list: false,
        });
      }
    }
    for (const row of listRows) {
      for (const occurrence of listOccurrencesInRange(
        toList(row),
        overrides.get(row.id) ?? [],
        range,
      )) {
        // Ce qui est déjà fait n'est plus « à faire aujourd'hui ».
        if (occurrence.doneAt !== null) continue;
        if (occurrence.startsAt < range.from || occurrence.startsAt >= range.to) continue;
        items.push({
          startsAt: occurrence.startsAt,
          allDay: occurrence.allDay,
          title: row.title,
          list: true,
        });
      }
    }
    return items;
  },

  postInChannel: (userId, content) => reminderRepository.postInChannel(userId, content),
};

async function overridesOf(series: ListRow[]): Promise<Map<string, OccurrenceOverride[]>> {
  const byList = new Map<string, OccurrenceOverride[]>();
  if (series.length === 0) return byList;

  const { data, error } = await admin
    .from("task_list_occurrences")
    .select("list_id, occurrence_at, done_at, moved_to, cancelled")
    .in(
      "list_id",
      series.map((row) => row.id),
    );
  if (error) {
    // Sans exceptions, une date déplacée ou annulée s'afficherait à sa place d'origine.
    logger.warn("morning-brief.repository", `Exceptions de séries illisibles : ${error.message}`);
    return byList;
  }

  for (const row of data as unknown as {
    list_id: string;
    occurrence_at: string;
    done_at: string | null;
    moved_to: string | null;
    cancelled: boolean;
  }[]) {
    byList.set(row.list_id, [
      ...(byList.get(row.list_id) ?? []),
      {
        occurrenceAt: row.occurrence_at,
        doneAt: row.done_at,
        movedTo: row.moved_to,
        cancelled: row.cancelled,
      },
    ]);
  }
  return byList;
}

function toEvent(row: EventRow): CalendarEvent {
  return {
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

function toList(row: ListRow): TaskList {
  return {
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
  };
}
