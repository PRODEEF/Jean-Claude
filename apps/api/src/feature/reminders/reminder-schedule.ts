import type { CalendarEvent } from "@jc/domain";
import { occurrencesInRange } from "../../domain/calendar/occurrences.js";

/** Un rendez-vous dont l'utilisateur est propriétaire, tel que le planificateur le lit. */
export type ReminderEvent = CalendarEvent & { userId: string };

/** Une occurrence dont le rappel est à envoyer. */
export type DueReminder = { event: ReminderEvent; occurrenceAt: string };

/**
 * Plus long délai de rappel que l'application permet : sept jours (cf.
 * `reminderMinutesBefore`). Borne la recherche des rendez-vous à venir.
 */
export const MAX_LEAD_MS = 10_080 * 60_000;

/**
 * Occurrences dont l'heure de rappel tombe dans `]now − window, now]`.
 *
 * Le rappel d'une occurrence part `reminderMinutesBefore` avant son début. La
 * fenêtre est plus large que la cadence du planificateur : un passage en retard
 * ou manqué se rattrape au suivant, et `reminders_sent` évite le doublon.
 */
export function dueReminders(events: ReminderEvent[], now: Date, windowMs: number): DueReminder[] {
  const due: DueReminder[] = [];

  for (const event of events) {
    const leadMs = (event.reminderMinutesBefore ?? -1) * 60_000;
    // Un rendez-vous sans rappel n'a rien à envoyer. 0 minute est un rappel au
    // début, pas une absence de rappel.
    if (leadMs < 0) continue;

    // L'occurrence se lit dans une fenêtre décalée du délai : son début doit
    // tomber dans `]now − window + lead, now + lead]`.
    const from = new Date(now.getTime() - windowMs + leadMs);
    const to = new Date(now.getTime() + leadMs + 1);

    for (const occurrence of occurrencesInRange(event, {
      from: from.toISOString(),
      to: to.toISOString(),
    })) {
      const startsAt = new Date(occurrence.startsAt).getTime();
      // `occurrencesInRange` rend aussi une occurrence commencée avant la
      // fenêtre qui s'y prolonge : son rappel est déjà parti, pas à refaire.
      if (startsAt <= from.getTime() || startsAt > to.getTime() - 1) continue;

      due.push({ event, occurrenceAt: occurrence.startsAt });
    }
  }

  return due;
}
