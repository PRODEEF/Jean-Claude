import { z } from "zod";
import { isoDateTimeSchema, labelSchema, uuidSchema } from "../shared/primitives";

/**
 * Règle de récurrence au format RRULE (RFC 5545), ex. `FREQ=WEEKLY;BYDAY=TU`.
 *
 * Choix volontaire d'un standard plutôt que d'un format maison : « j'ai kiné
 * tous les mardis à 18h » (§12.2, A.11) doit pouvoir être exporté vers un
 * calendrier tiers, et importé depuis Google Calendar lors de la reprise
 * d'usage visée par la Cible 1 (§0.2), sans conversion.
 */
export const rruleSchema = z.string().max(500);

export const calendarEventSchema = z.object({
  id: uuidSchema,
  title: labelSchema,
  notes: z.string().max(4_000).nullable(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema.nullable(),
  allDay: z.boolean(),
  /** `null` = événement ponctuel. Renseigné = série récurrente (A.11). */
  rrule: rruleSchema.nullable(),
  /**
   * Délai de rappel avant chaque occurrence, en minutes.
   * Posé automatiquement sur les rendez-vous récurrents, sans ressaisie (A.11).
   */
  reminderMinutesBefore: z.number().int().min(0).max(10_080).nullable(),
  folderId: uuidSchema.nullable(),
  conversationId: uuidSchema.nullable(),
  createdByAssistant: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const createCalendarEventSchema = z.object({
  title: labelSchema,
  notes: z.string().max(4_000).nullable().optional(),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema.nullable().optional(),
  allDay: z.boolean().default(false),
  rrule: rruleSchema.nullable().optional(),
  reminderMinutesBefore: z.number().int().min(0).max(10_080).nullable().optional(),
  folderId: uuidSchema.nullable().optional(),
});

export type CreateCalendarEvent = z.infer<typeof createCalendarEventSchema>;

export const updateCalendarEventSchema = createCalendarEventSchema.partial();
export type UpdateCalendarEvent = z.infer<typeof updateCalendarEventSchema>;

/** Fenêtre de consultation — alimente la vue mois et la vue semaine de la maquette. */
export const calendarRangeSchema = z
  .object({
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
  })
  .refine((r) => new Date(r.from) < new Date(r.to), {
    message: "`from` doit précéder `to`",
  });

export type CalendarRange = z.infer<typeof calendarRangeSchema>;
