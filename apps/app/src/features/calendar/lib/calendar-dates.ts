import type { CalendarEvent, CalendarRange } from "@jc/domain";

/**
 * Arithmétique de dates de la grille du calendrier.
 *
 * Aucune dépendance : `Intl` et `Date` couvrent le besoin sur les trois
 * cibles, et une bibliothèque de dates pèserait plus lourd dans le bundle que
 * les quelques fonctions ci-dessous.
 *
 * Les horodatages de l'API sont en UTC ; toutes les fonctions d'ici rendent
 * des dates dans le fuseau de l'appareil, parce que c'est celui dans lequel
 * l'utilisateur lit son agenda.
 */

/** Lundi en tête : convention française, et celle de la maquette web. */
export const WEEKDAY_LABELS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."] as const;

const WEEKDAY_FULL = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
] as const;

const MONTH_NAMES = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
] as const;

export const MINUTES_PER_DAY = 24 * 60;

/** 6 semaines : le maximum qu'un mois puisse occuper, quel que soit son premier jour. */
const MONTH_GRID_CELLS = 42;

/** Durée prêtée à un événement sans heure de fin, pour lui donner une hauteur. */
const IMPLICIT_DURATION_MINUTES = 60;

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function addMonths(date: Date, months: number): Date {
  // Le jour est ramené au 1er avant le décalage : sans cela, le 31 mars moins
  // un mois donnerait le 3 mars, février n'ayant pas de 31e jour.
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/** Lundi de la semaine contenant `date`. */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const offset = (day.getDay() + 6) % 7;
  return addDays(day, -offset);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * 42 jours couvrant le mois de `anchor`, débordant sur les mois voisins.
 *
 * Un nombre de cellules fixe plutôt que variable : la grille garde la même
 * hauteur d'un mois à l'autre, et la vue ne sursaute pas à la navigation.
 */
export function monthGrid(anchor: Date): Date[] {
  const first = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  return Array.from({ length: MONTH_GRID_CELLS }, (_, index) => addDays(first, index));
}

export function weekDays(anchor: Date): Date[] {
  const monday = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** Fenêtre à demander à l'API pour afficher `days`, bornes locales converties en UTC. */
export function rangeOf(days: Date[]): CalendarRange {
  const first = days[0] ?? new Date();
  const last = days[days.length - 1] ?? first;
  return {
    from: startOfDay(first).toISOString(),
    to: addDays(startOfDay(last), 1).toISOString(),
  };
}

export function monthLabel(anchor: Date): string {
  return `${MONTH_NAMES[anchor.getMonth()] ?? ""} ${anchor.getFullYear()}`;
}

/** Ex. « Semaine du 7 au 13 septembre 2026 ». */
export function weekLabel(anchor: Date): string {
  const days = weekDays(anchor);
  const first = days[0] ?? anchor;
  const last = days[6] ?? anchor;
  const monthOf = (date: Date) => (MONTH_NAMES[date.getMonth()] ?? "").toLowerCase();

  if (first.getMonth() === last.getMonth()) {
    return `Semaine du ${first.getDate()} au ${last.getDate()} ${monthOf(last)} ${last.getFullYear()}`;
  }
  return `Semaine du ${first.getDate()} ${monthOf(first)} au ${last.getDate()} ${monthOf(last)} ${last.getFullYear()}`;
}

/** Ex. « 14h30 », « 9h ». Format parlé plutôt que « 14:30 », comme la maquette. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  const minutes = date.getMinutes();
  return minutes === 0
    ? `${date.getHours()}h`
    : `${date.getHours()}h${String(minutes).padStart(2, "0")}`;
}

export function formatDayLabel(date: Date): string {
  return `${WEEKDAY_LABELS[(date.getDay() + 6) % 7] ?? ""} ${date.getDate()}`;
}

/**
 * Ex. « lundi 7 septembre ».
 *
 * Écrit à la main plutôt que confié à `Intl` : le moteur Hermes n'embarque pas
 * toutes les locales sur Android, et une date en anglais passerait inaperçue
 * jusqu'à un test sur appareil.
 */
export function formatFullDay(date: Date): string {
  const weekday = WEEKDAY_FULL[(date.getDay() + 6) % 7] ?? "";
  const month = (MONTH_NAMES[date.getMonth()] ?? "").toLowerCase();
  return `${weekday} ${date.getDate()} ${month}`;
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
