import type {
  CalendarEvent,
  CalendarRange,
  CreateCalendarEvent,
  UpdateCalendarEvent,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import { forUser } from "../../core/supabase/supabase.js";
import type { ICalendarRepository } from "./calendar.repository.interface.js";

/** Ligne Postgres — snake_case, telle que renvoyée par Supabase. */
type CalendarEventRow = {
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

function toEntity(row: CalendarEventRow): CalendarEvent {
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

const COLUMNS =
  "id, title, notes, starts_at, ends_at, all_day, rrule, reminder_minutes_before, folder_id, conversation_id, created_by_assistant, created_at, updated_at";

export const calendarRepository: ICalendarRepository = {
  async findInRange(range, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("calendar_events")
      .select(COLUMNS)
      // Un événement chevauche la fenêtre s'il commence avant sa fin et se
      // termine après son début. Sans le second filtre, un rendez-vous
      // commencé la veille disparaîtrait de la journée qu'il occupe encore.
      // Les bornes sont encadrées de guillemets : dans un `or`, PostgREST
      // découpe sur `.` et `,`, et un horodatage ISO porte des points.
      .lt("starts_at", range.to)
      .or(`ends_at.gt."${range.from}",and(ends_at.is.null,starts_at.gte."${range.from}")`)
      .order("starts_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data as unknown as CalendarEventRow[]).map(toEntity);
  },

  async findById(id, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("calendar_events")
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toEntity(data as unknown as CalendarEventRow) : null;
  },

  async create(userId, input: CreateCalendarEvent, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("calendar_events")
      .insert({
        user_id: userId,
        title: input.title,
        notes: input.notes ?? null,
        starts_at: input.startsAt,
        ends_at: input.endsAt ?? null,
        all_day: input.allDay,
        rrule: input.rrule ?? null,
        reminder_minutes_before: input.reminderMinutesBefore ?? null,
        folder_id: input.folderId ?? null,
      })
      .select(COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return toEntity(data as unknown as CalendarEventRow);
  },

  async update(id, patch: UpdateCalendarEvent, accessToken) {
    // Un `undefined` doit laisser la colonne intacte ; un `null` explicite doit
    // l'effacer — retirer l'heure de fin d'un rendez-vous, par exemple.
    const payload: Record<string, unknown> = {};
    if (patch.title !== undefined) payload["title"] = patch.title;
    if (patch.notes !== undefined) payload["notes"] = patch.notes;
    if (patch.startsAt !== undefined) payload["starts_at"] = patch.startsAt;
    if (patch.endsAt !== undefined) payload["ends_at"] = patch.endsAt;
    if (patch.allDay !== undefined) payload["all_day"] = patch.allDay;
    if (patch.rrule !== undefined) payload["rrule"] = patch.rrule;
    if (patch.reminderMinutesBefore !== undefined) {
      payload["reminder_minutes_before"] = patch.reminderMinutesBefore;
    }
    if (patch.folderId !== undefined) payload["folder_id"] = patch.folderId;

    const { data, error } = await forUser(accessToken)
      .from("calendar_events")
      .update(payload)
      .eq("id", id)
      .select(COLUMNS)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw httpError(404, "Événement introuvable.");
    return toEntity(data as unknown as CalendarEventRow);
  },

  async delete(id, accessToken) {
    const { error } = await forUser(accessToken).from("calendar_events").delete().eq("id", id);

    if (error) throw new Error(error.message);
  },
};
