import type { CalendarEvent } from "../calendar/calendar.schema";
import type { TaskList, TaskListWithTasks } from "../task/task.schema";

/**
 * Ce qui place les todolistes et les rendez-vous dans le temps.
 *
 * Ces règles décidaient jusqu'ici depuis `apps/app` : quel jour porte quoi,
 * quelle liste le calendrier redessine, comment deux créneaux simultanés se
 * partagent une colonne. Elles vivent ici parce qu'elles **décident** — la
 * rule 300 les rend alors testables d'office —, et parce que les quatre
 * plateformes doivent en donner la même réponse.
 *
 * ⚠️ Tout y est lu dans l'horloge de l'appareil : c'est celle dans laquelle
 * l'utilisateur consulte son agenda. Ces fonctions sont donc faites pour un
 * client qui affiche, jamais pour l'API qui date — celle-ci raisonne dans le
 * fuseau du profil (`core/timezone.ts`) et n'a rien à venir chercher ici.
 */

// ── Bornes de journée ──────────────────────────────────────────────────────

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

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ── Moments de la journée ──────────────────────────────────────────────────

/**
 * Découpage d'une journée en moments.
 *
 * C'est la forme de la maquette — MATIN, APRÈM, SOIRÉE, SOIR — et celle dans
 * laquelle l'utilisateur écrit déjà ses journées. Le moment est déduit de
 * l'heure de l'échéance plutôt que stocké : demander « à quel moment ? » en
 * plus de « quand ? » ajouterait une question à chaque saisie (§13.4.1).
 */
export type MomentKey = "anytime" | "morning" | "afternoon" | "evening" | "night";

export type Moment = { key: MomentKey; label: string };

/** Ordre d'affichage, du plus vague au plus tardif. */
export const MOMENTS: Moment[] = [
  { key: "anytime", label: "Dans la journée" },
  { key: "morning", label: "Matin" },
  { key: "afternoon", label: "Après-midi" },
  { key: "evening", label: "Soirée" },
  { key: "night", label: "Soir" },
];

/** Bornes en heures locales, celles du langage courant plutôt qu'un découpage égal. */
const AFTERNOON_FROM = 12;
const EVENING_FROM = 18;
const NIGHT_FROM = 22;

/**
 * Moment d'une échéance.
 *
 * `dueAllDay` est lu, jamais redéduit de l'heure. La règle « minuit pile vaut
 * dans la journée » suppose de savoir dans quelle horloge on lit cette heure :
 * l'appareil et le serveur n'ont pas la même, et une liste datée « samedi »
 * depuis un fuseau lointain s'annonçait « samedi à 2h ».
 *
 * L'heure sert encore à trancher entre matin, après-midi et soirée — et là,
 * c'est bien l'horloge de l'appareil qui a raison.
 */
export function momentOf(list: Pick<TaskList, "dueAt" | "dueAllDay">): MomentKey {
  if (list.dueAt === null || list.dueAllDay !== false) return "anytime";

  const hours = new Date(list.dueAt).getHours();
  if (hours >= NIGHT_FROM) return "night";
  if (hours >= EVENING_FROM) return "evening";
  if (hours >= AFTERNOON_FROM) return "afternoon";
  return "morning";
}

export type MomentGroup = { moment: Moment; lists: TaskListWithTasks[] };

/**
 * Listes échues ce jour-là, regroupées par moment.
 *
 * Les moments vides sont écartés : sept jours × cinq moments rempliraient la
 * semaine de « rien de prévu » et noieraient ce qui s'y passe vraiment.
 */
export function momentsOfDay(lists: TaskListWithTasks[], day: Date): MomentGroup[] {
  const ofDay = listsOfDay(lists, day).sort(byDueDate);

  return MOMENTS.map((moment) => ({
    moment,
    lists: ofDay.filter((list) => momentOf(list) === moment.key),
  })).filter((group) => group.lists.length > 0);
}

// ── Ce que porte une journée ───────────────────────────────────────────────

/**
 * Listes portant une échéance, tous dossiers confondus.
 *
 * L'échéance appartient à la liste et non à ses lignes : « les courses avant
 * samedi » date la liste, pas la farine.
 */
export function datedLists(lists: TaskListWithTasks[]): TaskListWithTasks[] {
  return lists.filter((list) => list.dueAt !== null);
}

/**
 * Todolistes datées que le calendrier doit encore afficher comme listes.
 *
 * Une liste liée à un rendez-vous déjà chargé est représentée par ce
 * rendez-vous (A.3) — la redessiner ferait apparaître deux fois la même
 * échéance le même jour. Si le lien existe mais que l'événement n'est pas dans
 * la fenêtre — cache incomplet, rendez-vous hors période — la liste resterait
 * invisible partout : on la montre alors comme n'importe quelle liste.
 */
export function listsWithoutVisibleEvent(
  lists: TaskListWithTasks[],
  eventIds: ReadonlySet<string>,
): TaskListWithTasks[] {
  return datedLists(lists).filter(
    (list) => list.eventId === null || !eventIds.has(list.eventId),
  );
}

export function listsOfDay(lists: TaskListWithTasks[], day: Date): TaskListWithTasks[] {
  const start = startOfDay(day).getTime();
  const end = addDays(startOfDay(day), 1).getTime();

  return lists.filter((list) => {
    const due = list.dueAt === null ? null : new Date(list.dueAt).getTime();
    return due !== null && due >= start && due < end;
  });
}

/**
 * Tâches restant à faire dans une liste.
 *
 * Ce qui est coché ne charge plus la journée : c'est ce décompte-là que le
 * calendrier affiche pour dire qu'un jour est chargé.
 */
export function openTaskCount(list: TaskListWithTasks): number {
  return list.tasks.filter((task) => !task.done).length;
}

/**
 * Ordre d'affichage d'une journée : les plus tôt d'abord.
 *
 * Comparaison de chaînes et non de dates : deux horodatages ISO du même fuseau
 * s'ordonnent déjà lexicographiquement, et l'API les rend tous en UTC.
 */
export function byDueDate(a: TaskListWithTasks, b: TaskListWithTasks): number {
  return (a.dueAt ?? "").localeCompare(b.dueAt ?? "");
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

// ── Placement en colonnes ──────────────────────────────────────────────────

/** Borne haute du placement d'un créneau dans la colonne d'une journée. */
const MINUTES_PER_DAY = 24 * 60;

/** Durée prêtée à un créneau sans heure de fin, pour lui donner une hauteur. */
const IMPLICIT_DURATION_MINUTES = 60;

export type PositionedEvent = {
  event: CalendarEvent;
  /** Minutes depuis minuit, borné au jour affiché. */
  startMinute: number;
  endMinute: number;
  /** Colonne occupée parmi les créneaux qui se chevauchent. */
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
 * todolistes échues à heure précise : l'algorithme est le même, seul ce qu'il
 * positionne diffère.
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
      const startMinute = clamp(Math.round((start - dayStart) / 60_000), 0, MINUTES_PER_DAY);
      return {
        ref: event,
        startMinute,
        // Jamais avant son début : une fin antérieure — donnée incohérente,
        // événement à cheval sur la veille — donnerait une hauteur négative et
        // des colonnes calculées sur un intervalle à l'envers.
        endMinute: clamp(Math.round((end - dayStart) / 60_000), startMinute, MINUTES_PER_DAY),
      };
    });

  return layoutBoxes(boxes).map(({ ref, ...box }) => ({ ...box, event: ref }));
}

/**
 * Sépare les todolistes échues d'un jour entre celles qui visent un créneau —
 * à placer dans la grille horaire, comme un rendez-vous — et celles qui visent
 * la journée, réservées au bandeau au-dessus.
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
