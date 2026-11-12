import type { ListOccurrence, TaskList } from "@jc/domain";
import { seriesDates } from "../calendar/occurrences.js";

/**
 * Ce qui est arrivé à UNE date d'une série (table `task_list_occurrences`).
 *
 * `occurrenceAt` est le début tel que la série le calcule : c'est la clé, elle
 * ne bouge pas quand l'occurrence est déplacée.
 */
export type OccurrenceOverride = {
  occurrenceAt: string;
  doneAt: string | null;
  movedTo: string | null;
  cancelled: boolean;
};

/**
 * Occurrences d'une liste qui chevauchent la fenêtre.
 *
 * Une liste ponctuelle n'en a qu'une, à son échéance, « faite » quand la liste
 * l'est. Une série est dépliée, puis chaque date reçoit ce qu'on a décidé pour
 * elle seule : supprimée, elle disparaît ; déplacée, elle se lit à sa nouvelle
 * place avec la même durée ; cochée, elle porte sa propre date de complétion.
 *
 * Les dates qui ont une exception sont ajoutées à celles de la fenêtre avant
 * d'être filtrées : une occurrence déplacée DANS la fenêtre depuis une date qui
 * lui est extérieure doit apparaître, et une déplacée HORS de la fenêtre depuis
 * une date qui lui est intérieure doit disparaître.
 */
export function listOccurrencesInRange(
  list: TaskList,
  overrides: readonly OccurrenceOverride[],
  range: { from: string; to: string },
): ListOccurrence[] {
  if (list.dueAt === null) return [];

  const allDay = list.dueAllDay ?? true;
  const durationMs =
    list.endsAt === null ? 0 : new Date(list.endsAt).getTime() - new Date(list.dueAt).getTime();

  const overlaps = (startsAt: string, endsAt: string | null): boolean => {
    const start = new Date(startsAt).getTime();
    const end = endsAt === null ? start : new Date(endsAt).getTime();
    return start < new Date(range.to).getTime() && end >= new Date(range.from).getTime();
  };

  const occurrence = (
    occurrenceAt: string,
    startsAt: string,
    doneAt: string | null,
  ): ListOccurrence => ({
    listId: list.id,
    occurrenceAt,
    startsAt,
    endsAt:
      list.endsAt === null
        ? null
        : new Date(new Date(startsAt).getTime() + durationMs).toISOString(),
    allDay,
    doneAt,
  });

  if (list.rrule === null) {
    const single = occurrence(list.dueAt, list.dueAt, list.doneAt);
    return overlaps(single.startsAt, single.endsAt) ? [single] : [];
  }

  // Une occurrence commencée avant la fenêtre qui s'y prolonge reste visible.
  const dates = seriesDates(list.id, list.rrule, new Date(list.dueAt), {
    from: new Date(new Date(range.from).getTime() - durationMs).toISOString(),
    to: range.to,
  });
  // Règle illisible : la liste reste visible à son échéance, comme un rendez-vous.
  if (dates === null) {
    const single = occurrence(list.dueAt, list.dueAt, list.doneAt);
    return overlaps(single.startsAt, single.endsAt) ? [single] : [];
  }

  const byKey = new Map(overrides.map((item) => [new Date(item.occurrenceAt).getTime(), item]));
  const keys = new Set([...dates.map((date) => date.getTime()), ...byKey.keys()]);

  return [...keys]
    .sort((a, b) => a - b)
    .flatMap((key) => {
      const override = byKey.get(key);
      if (override?.cancelled) return [];
      const occurrenceAt = new Date(key).toISOString();
      const item = occurrence(
        occurrenceAt,
        override?.movedTo ?? occurrenceAt,
        override?.doneAt ?? null,
      );
      return overlaps(item.startsAt, item.endsAt) ? [item] : [];
    });
}
