import type { CalendarEvent, CalendarRange } from "@jc/domain";
import { addDays, startOfDay } from "@/shared/lib/dates";

/**
 * Placement des événements dans la grille du calendrier.
 *
 * L'arithmétique de dates elle-même vit dans `shared/lib/dates` : la vue
 * hebdomadaire des todolistes s'appuie sur les mêmes semaines et les mêmes
 * libellés. Ne restent ici que les fonctions qui parlent d'événements.
 */

/** Borne haute du placement d'un événement dans la colonne d'une journée. */
const MINUTES_PER_DAY = 24 * 60;

/** Durée prêtée à un événement sans heure de fin, pour lui donner une hauteur. */
const IMPLICIT_DURATION_MINUTES = 60;

/** Fenêtre à demander à l'API pour afficher `days`, bornes locales converties en UTC. */
export function rangeOf(days: Date[]): CalendarRange {
  const first = days[0] ?? new Date();
  const last = days[days.length - 1] ?? first;
  return {
    from: startOfDay(first).toISOString(),
    to: addDays(startOfDay(last), 1).toISOString(),
  };
}

/**
 * Événements chevauchant `day`.
 *
 * Un événement sans heure de fin est traité comme instantané : il n'apparaît
 * qu'au jour où il commence, sans quoi un rappel de 9h déborderait sur la
 * journée suivante par le seul jeu des comparaisons de bornes.
 */
export function eventsOfDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(startOfDay(day), 1).getTime();

  return events.filter((event) => {
    const start = new Date(event.startsAt).getTime();
    const end = event.endsAt ? new Date(event.endsAt).getTime() : start + 1;
    return start < dayEnd && end > dayStart;
  });
}

export type PositionedEvent = {
  event: CalendarEvent;
  /** Minutes depuis minuit, borné au jour affiché. */
  startMinute: number;
  endMinute: number;
  /** Colonne occupée parmi les événements qui se chevauchent. */
  lane: number;
  laneCount: number;
};

/**
 * Place les événements horaires d'une journée en colonnes.
 *
 * Deux rendez-vous simultanés se partagent la largeur du jour plutôt que de se
 * masquer l'un l'autre — c'est ce que font le Calendrier iOS, Google Calendar
 * et Fantastical, et sans quoi une journée chargée devient illisible (§4.2).
 */
export function layoutDayEvents(events: CalendarEvent[], day: Date): PositionedEvent[] {
  const dayStart = startOfDay(day).getTime();

  const boxes = events
    .filter((event) => !event.allDay)
    .map((event) => {
      const start = new Date(event.startsAt).getTime();
      const end = event.endsAt
        ? new Date(event.endsAt).getTime()
        : start + IMPLICIT_DURATION_MINUTES * 60_000;
      return {
        event,
        startMinute: clamp(Math.round((start - dayStart) / 60_000), 0, MINUTES_PER_DAY),
        endMinute: clamp(Math.round((end - dayStart) / 60_000), 0, MINUTES_PER_DAY),
      };
    })
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  const positioned: PositionedEvent[] = [];
  let cluster: typeof boxes = [];
  let clusterEnd = -1;

  // Un groupe se ferme dès qu'un événement commence après la fin de tous les
  // précédents : le partage de largeur ne vaut que dans le groupe, sinon un
  // seul chevauchement du matin rétrécirait toute la journée.
  const flush = () => {
    const laneEnds: number[] = [];
    const assigned = cluster.map((box) => {
      const free = laneEnds.findIndex((end) => end <= box.startMinute);
      const lane = free === -1 ? laneEnds.length : free;
      laneEnds[lane] = box.endMinute;
      return { ...box, lane };
    });

    for (const box of assigned) positioned.push({ ...box, laneCount: laneEnds.length });
    cluster = [];
    clusterEnd = -1;
  };

  for (const box of boxes) {
    if (cluster.length > 0 && box.startMinute >= clusterEnd) flush();
    cluster.push(box);
    clusterEnd = Math.max(clusterEnd, box.endMinute);
  }
  if (cluster.length > 0) flush();

  return positioned;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
