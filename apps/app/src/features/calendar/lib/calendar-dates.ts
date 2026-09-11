import type { CalendarEvent, CalendarRange, TaskListWithTasks } from "@jc/domain";
import { addDays, startOfDay } from "@/shared/lib/dates";
import { momentOf } from "./task-week";

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

export type PositionedList = {
  list: TaskListWithTasks;
  startMinute: number;
  endMinute: number;
  lane: number;
  laneCount: number;
};

type TimeBox<T> = { ref: T; startMinute: number; endMinute: number };
type PositionedBox<T> = TimeBox<T> & { lane: number; laneCount: number };

/**
 * Place des créneaux d'une journée en colonnes.
 *
 * Deux créneaux simultanés se partagent la largeur du jour plutôt que de se
 * masquer l'un l'autre — c'est ce que font le Calendrier iOS, Google Calendar
 * et Fantastical, et sans quoi une journée chargée devient illisible (§4.2).
 *
 * Générique parce que la grille y place aussi bien des rendez-vous que des
 * todolistes échues à heure précise : l'algorithme de placement est le même,
 * seul ce qu'il positionne diffère.
 */
function layoutBoxes<T>(boxes: TimeBox<T>[]): PositionedBox<T>[] {
  const sorted = [...boxes].sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  );

  const positioned: PositionedBox<T>[] = [];
  let cluster: TimeBox<T>[] = [];
  let clusterEnd = -1;

  // Un groupe se ferme dès qu'un créneau commence après la fin de tous les
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

  for (const box of sorted) {
    if (cluster.length > 0 && box.startMinute >= clusterEnd) flush();
    cluster.push(box);
    clusterEnd = Math.max(clusterEnd, box.endMinute);
  }
  if (cluster.length > 0) flush();

  return positioned;
}

/** Place les événements horaires d'une journée en colonnes. */
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
        ref: event,
        startMinute: clamp(Math.round((start - dayStart) / 60_000), 0, MINUTES_PER_DAY),
        endMinute: clamp(Math.round((end - dayStart) / 60_000), 0, MINUTES_PER_DAY),
      };
    });

  return layoutBoxes(boxes).map(({ ref, ...box }) => ({ ...box, event: ref }));
}

/**
 * Sépare les todolistes échues d'un jour entre celles qui portent une heure
 * précise — à placer dans la grille horaire, comme un rendez-vous — et celles
 * qui n'en portent pas, réservées au bandeau au-dessus.
 *
 * Minuit pile vaut « dans la journée », jamais un instant de la grille — même
 * convention que `momentOf`, déjà appliquée à la vue Todo du calendrier et au
 * formulaire de todoliste. Sans cette distinction, une liste pourtant datée à
 * heure précise se retrouvait dans le bandeau plat, indiscernable d'une liste
 * sans horaire.
 */
export function layoutDayLists(
  lists: TaskListWithTasks[],
  day: Date,
): { timed: PositionedList[]; untimed: TaskListWithTasks[] } {
  const dayStart = startOfDay(day).getTime();
  const untimed: TaskListWithTasks[] = [];

  const boxes = lists.flatMap((list) => {
    if (list.dueAt === null || momentOf(list) === "anytime") {
      untimed.push(list);
      return [];
    }

    const start = new Date(list.dueAt).getTime();
    const startMinute = clamp(Math.round((start - dayStart) / 60_000), 0, MINUTES_PER_DAY);
    return [
      {
        ref: list,
        startMinute,
        endMinute: clamp(startMinute + IMPLICIT_DURATION_MINUTES, 0, MINUTES_PER_DAY),
      },
    ];
  });

  return {
    timed: layoutBoxes(boxes).map(({ ref, ...box }) => ({ ...box, list: ref })),
    untimed,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
