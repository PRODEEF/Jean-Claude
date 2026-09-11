import type { CreateCalendarEvent } from "./calendar.schema";
import type { TaskList } from "../task/task.schema";

/**
 * Durée prêtée au créneau d'une todoliste qui vise une heure précise.
 *
 * Une heure, comme un rendez-vous ordinaire : l'échéance dit quand la liste
 * doit être bouclée, pas combien de temps elle prend, et un créneau sans
 * hauteur serait illisible dans la grille.
 */
const SLOT_DURATION_MINUTES = 60;

/**
 * Ce que vaut, dans l'agenda, le créneau posé pour une todoliste (A.3).
 *
 * **La liste est la source, le rendez-vous en est la projection.** Tout ce qui
 * se lit sur le créneau vient d'elle ; ce qu'elle ne dit pas — les notes, le
 * rappel — reste au rendez-vous et n'est pas touché.
 *
 * Une seule définition pour les trois chemins qui posent ou déplacent ce
 * créneau : l'acceptation d'une proposition, la modification de la liste, la
 * modification du rendez-vous. Chacun n'en projetait qu'une part — le titre
 * n'était jamais repoussé, supprimer la liste laissait le créneau orphelin —
 * et l'agenda finissait par annoncer autre chose que ce que la liste portait.
 *
 * `null` quand la liste n'a pas d'échéance : il n'y a alors rien à bloquer.
 */
export function slotForList(
  list: Pick<TaskList, "title" | "dueAt" | "dueAllDay">,
): CreateCalendarEvent | null {
  if (list.dueAt === null) return null;

  // `null` vaut « dans la journée » : une échéance sans moment enregistré ne
  // désigne pas un créneau, et la base ne laisse ce cas apparaître que sur des
  // listes écrites avant que l'intention ne soit conservée.
  const allDay = list.dueAllDay !== false;

  return {
    title: list.title,
    startsAt: list.dueAt,
    // Une journée entière n'a pas de fin : elle tient le jour.
    endsAt: allDay ? null : addMinutes(list.dueAt, SLOT_DURATION_MINUTES),
    allDay,
  };
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}
