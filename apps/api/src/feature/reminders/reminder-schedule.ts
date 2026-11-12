import type { CalendarEvent, TaskList } from "@jc/domain";
import { occurrencesInRange } from "../../domain/calendar/occurrences.js";
import {
  listOccurrencesInRange,
  type OccurrenceOverride,
} from "../../domain/task/list-occurrences.js";

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

/** Une liste datée dont l'utilisateur est propriétaire, avec ce qui est arrivé à ses dates. */
export type RemindableList = {
  list: TaskList & { userId: string };
  overrides: OccurrenceOverride[];
};

/** Une occurrence de liste dont le rappel est à envoyer. */
export type DueListReminder = { list: TaskList & { userId: string }; occurrenceAt: string };

/**
 * Pour les listes, ce que `dueReminders` fait pour les rendez-vous : mêmes bornes,
 * mêmes règles de fenêtre. En plus, une date supprimée ou déplacée suit son
 * exception, et une date déjà cochée n'a plus rien à rappeler.
 *
 * `occurrenceAt` est la clé d'origine de la date, pas l'endroit où elle a été
 * déplacée : c'est elle que retient la table des rappels envoyés, et elle ne
 * change pas quand on déplace la date.
 */
export function dueListReminders(
  items: RemindableList[],
  now: Date,
  windowMs: number,
): DueListReminder[] {
  const due: DueListReminder[] = [];

  for (const { list, overrides } of items) {
    const leadMs = (list.reminderMinutesBefore ?? -1) * 60_000;
    if (leadMs < 0) continue;

    const from = new Date(now.getTime() - windowMs + leadMs);
    const to = new Date(now.getTime() + leadMs + 1);

    for (const occurrence of listOccurrencesInRange(list, overrides, {
      from: from.toISOString(),
      to: to.toISOString(),
    })) {
      if (occurrence.doneAt !== null) continue;
      const startsAt = new Date(occurrence.startsAt).getTime();
      if (startsAt <= from.getTime() || startsAt > to.getTime() - 1) continue;

      due.push({ list, occurrenceAt: occurrence.occurrenceAt });
    }
  }

  return due;
}
