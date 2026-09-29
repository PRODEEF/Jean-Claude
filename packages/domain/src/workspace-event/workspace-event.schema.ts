import { z } from "zod";
import { calendarEventSchema } from "../calendar/calendar.schema";
import { isoDateTimeSchema, labelSchema, uuidSchema } from "../shared/primitives";

/**
 * Événements d'espace — lot 8 de docs/COLLABORATION.md (§10).
 *
 * Rattaché à une conversation d'espace, un événement s'affiche dans le
 * calendrier de chacun de ses membres, qui peuvent tous le modifier. Ponctuel :
 * pas de récurrence.
 */

export const workspaceEventSchema = z.object({
  id: uuidSchema,
  groupId: uuidSchema,
  title: labelSchema,
  notes: z.string().max(4_000).nullable(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema.nullable(),
  allDay: z.boolean(),
  /** Rappel commun à tous les membres. */
  reminderMinutesBefore: z.number().int().min(0).max(10_080).nullable(),
  /** `null` si le compte de l'auteur a disparu. */
  createdBy: uuidSchema.nullable(),
  createdByAssistant: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type WorkspaceEvent = z.infer<typeof workspaceEventSchema>;

export const createWorkspaceEventSchema = z.object({
  groupId: uuidSchema,
  title: labelSchema,
  notes: z.string().max(4_000).nullable().optional(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema.nullable().optional(),
  allDay: z.boolean().default(false),
  reminderMinutesBefore: z.number().int().min(0).max(10_080).nullable().optional(),
});
export type CreateWorkspaceEvent = z.infer<typeof createWorkspaceEventSchema>;

export const updateWorkspaceEventSchema = createWorkspaceEventSchema
  .omit({ groupId: true })
  .partial();
export type UpdateWorkspaceEvent = z.infer<typeof updateWorkspaceEventSchema>;

/** L'espace et la conversation d'un événement, tels que le calendrier les montre. */
export const eventSpaceSchema = z.object({
  workspaceId: uuidSchema,
  workspaceName: z.string(),
  groupId: uuidSchema,
  groupTitle: z.string(),
});
export type EventSpace = z.infer<typeof eventSpaceSchema>;

/**
 * Une entrée de la vue calendrier : un événement personnel (`space: null`) ou
 * un événement d'espace, sous la même forme pour que les grilles les
 * affichent de la même façon.
 */
export const calendarEntrySchema = calendarEventSchema.extend({
  space: eventSpaceSchema.nullable(),
});
export type CalendarEntry = z.infer<typeof calendarEntrySchema>;

export const groupEventSuggestionStatusSchema = z.enum(["pending", "accepted", "dismissed"]);

/**
 * Événement proposé par Jean-Claude dans une conversation d'espace (§12.1) :
 * n'importe quel membre l'ajoute au calendrier de tous, ou l'ignore.
 */
export const groupEventSuggestionSchema = z.object({
  id: uuidSchema,
  groupId: uuidSchema,
  /** Le message de Jean-Claude sous lequel la carte s'affiche. */
  messageId: uuidSchema,
  title: z.string(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema.nullable(),
  allDay: z.boolean(),
  notes: z.string().nullable(),
  status: groupEventSuggestionStatusSchema,
  /** L'événement créé, une fois la proposition acceptée. */
  eventId: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type GroupEventSuggestion = z.infer<typeof groupEventSuggestionSchema>;

/** Ce qui vient d'arriver à un événement, pour la ligne laissée dans le fil. */
export type EventChange =
  | { kind: "created"; event: EventMoment }
  | { kind: "updated"; event: EventMoment; before: EventMoment }
  | { kind: "deleted"; event: EventMoment };

export type EventMoment = Pick<WorkspaceEvent, "title" | "startsAt" | "endsAt" | "allDay">;

/**
 * La ligne que le fil garde d'un geste sur un événement : « Clarisse a
 * déplacé « Réunion » au jeudi 3 octobre, 18 h ».
 *
 * Écrite dans le fuseau de l'auteur du geste : les membres d'un espace
 * partagent en général le même. « Déplacé » quand le moment change, «
 * modifié » sinon, pour dire d'un mot ce qui compte.
 */
export function describeEventChange(author: string, change: EventChange, timezone: string): string {
  const title = `« ${change.event.title} »`;
  switch (change.kind) {
    case "created":
      return `${author} a ajouté ${title} au calendrier : ${formatMoment(change.event, timezone)}.`;
    case "deleted":
      return `${author} a retiré ${title} du calendrier.`;
    case "updated": {
      const moved =
        change.before.startsAt !== change.event.startsAt ||
        change.before.endsAt !== change.event.endsAt ||
        change.before.allDay !== change.event.allDay;
      return moved
        ? `${author} a déplacé ${title} au ${formatMoment(change.event, timezone)}.`
        : `${author} a modifié ${title} : ${formatMoment(change.event, timezone)}.`;
    }
  }
}

/** « jeudi 3 octobre, 18 h – 19 h 30 », ou « jeudi 3 octobre, toute la journée ». */
export function formatMoment(event: EventMoment, timezone: string): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  }).formatToParts(new Date(event.startsAt));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  // « 1er octobre » : Intl écrit « 1 octobre », que l'usage français refuse.
  const dayNumber = part("day") === "1" ? "1er" : part("day");
  const day = `${part("weekday")} ${dayNumber} ${part("month")}`;
  if (event.allDay) return `${day}, toute la journée`;

  const start = formatHour(event.startsAt, timezone);
  return event.endsAt
    ? `${day}, ${start} – ${formatHour(event.endsAt, timezone)}`
    : `${day}, ${start}`;
}

/** « 18 h », « 18 h 30 » — l'usage français, plutôt que « 18:00 ». */
function formatHour(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  }).formatToParts(new Date(iso));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return minute === "00" ? `${Number(hour)} h` : `${Number(hour)} h ${minute}`;
}
