import { DEFAULT_DAY_PART_BOUNDS, type DayPartBounds } from "@jc/domain";
import { calendarDateIn, fromWall, shiftDays, toWall } from "../../core/timezone.js";
import { describeReminder } from "../reminders/reminder-message.js";

/**
 * Les trois points de la journée. Le nom du fichier garde « morning » : le point
 * du matin est venu le premier, l'après-midi et le soir s'y sont ajoutés.
 */
export type BriefKind = "morning" | "afternoon" | "evening";

export const BRIEF_KINDS: BriefKind[] = ["morning", "afternoon", "evening"];

/**
 * Plage horaire locale où le point du matin peut partir : à partir de 8 h, et
 * jusqu'à midi pour rattraper un passage du planificateur manqué. Passé midi,
 * « bonjour, voici ta journée » n'a plus de sens : on ne l'envoie pas.
 */
export const BRIEF_FROM_HOUR = 8;
export const BRIEF_UNTIL_HOUR = 12;

/** Dernière heure où le point du soir peut encore partir : passé 23 h, on laisse dormir. */
const EVENING_UNTIL_HOUR = 23;

/** Une chose prévue aujourd'hui : un rendez-vous ou une liste datée. */
export type BriefItem = {
  startsAt: string;
  allDay: boolean;
  title: string;
  /** Une liste (« à faire ») plutôt qu'un rendez-vous. */
  list: boolean;
  /** Déjà fait : le bilan du soir le compte, le matin et l'après-midi l'écartent. */
  done: boolean;
};

/**
 * Plage horaire locale d'un point. Le matin est fixe ; l'après-midi et le soir
 * suivent les limites « Après-midi » et « Soir » des Réglages de la personne
 * (Yann, 27 novembre) : le point part quand son après-midi commence, et jusqu'à
 * ce que le soir commence.
 */
export function briefWindow(
  kind: BriefKind,
  bounds: DayPartBounds = DEFAULT_DAY_PART_BOUNDS,
): { from: number; until: number } {
  if (kind === "morning") return { from: BRIEF_FROM_HOUR, until: BRIEF_UNTIL_HOUR };
  if (kind === "afternoon") return { from: bounds.afternoonFrom, until: bounds.eveningFrom };
  return { from: bounds.eveningFrom, until: EVENING_UNTIL_HOUR };
}

/** Est-ce l'heure de ce point, là où l'utilisateur se trouve ? */
export function isBriefTime(
  now: Date,
  timezone: string,
  kind: BriefKind = "morning",
  bounds: DayPartBounds = DEFAULT_DAY_PART_BOUNDS,
): boolean {
  const hour = toWall(now, timezone).getUTCHours();
  const { from, until } = briefWindow(kind, bounds);
  return hour >= from && hour < until;
}

/** Jour local `AAAA-MM-JJ` : la clé qui garantit un seul point par jour. */
export function localDay(now: Date, timezone: string): string {
  return calendarDateIn(now, timezone);
}

/** Bornes UTC du jour local : de minuit à minuit, dans le fuseau de l'utilisateur. */
export function dayBounds(now: Date, timezone: string): { from: Date; to: Date } {
  const wall = toWall(now, timezone);
  const midnight = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  return {
    from: fromWall(midnight, timezone),
    to: fromWall(shiftDays(midnight, 1), timezone),
  };
}

/** Bornes UTC du lendemain local, pour l'aperçu du point du soir. */
export function tomorrowBounds(now: Date, timezone: string): { from: Date; to: Date } {
  const wall = toWall(now, timezone);
  const midnight = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  return {
    from: fromWall(shiftDays(midnight, 1), timezone),
    to: fromWall(shiftDays(midnight, 2), timezone),
  };
}

/**
 * La journée en lignes : les journées entières d'abord, puis par heure.
 *
 * Les faits (titres, heures) sont toujours ceux de l'agenda, jamais ceux d'un
 * modèle : seule l'introduction est écrite par lui.
 */
export function describeAgenda(items: BriefItem[], timezone: string): string[] {
  return [...items]
    .sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || a.startsAt.localeCompare(b.startsAt))
    .map((item) => {
      const { clock } = describeReminder({
        title: item.title,
        startsAt: item.startsAt,
        allDay: item.allDay,
        reminderMinutesBefore: 0,
        timezone,
      });
      const when = clock ?? "toute la journée";
      return `- ${when} : ${item.title}${item.list ? " (liste)" : ""}`;
    });
}

/** Introduction de secours, quand le modèle ne répond pas. */
export function fixedGreeting(displayName: string | null, kind: BriefKind = "morning"): string {
  const name = displayName ? ` ${displayName}` : "";
  if (kind === "afternoon") return `Bon après-midi${name}, voici ce qu'il te reste à faire :`;
  if (kind === "evening") return `Bonsoir${name}, voici le bilan de ta journée :`;
  return `Bonjour${name}, voici ta journée :`;
}

/** Le message complet : une introduction, puis l'agenda du jour. */
export function briefMessage(greeting: string, items: BriefItem[], timezone: string): string {
  return [greeting, ...describeAgenda(items, timezone)].join("\n");
}

/**
 * Ce qu'il reste à faire : ce qui n'est pas fait, et — pour un rendez-vous — pas
 * encore passé. Une liste non cochée reste à faire même à l'heure dépassée : c'est
 * précisément ce qu'on veut qu'on voie.
 */
function remainingOf(items: BriefItem[], now: Date): BriefItem[] {
  return items.filter(
    (item) =>
      !item.done &&
      (item.list || item.allDay || new Date(item.startsAt).getTime() >= now.getTime()),
  );
}

/**
 * Le point de l'après-midi : ce qu'il reste à faire aujourd'hui. Quand il ne reste
 * rien, une phrase de calme plutôt que le silence (Yann, 27 novembre) : on sait au
 * moins que Jean-Claude a regardé.
 */
export function afternoonMessage(
  greeting: string,
  items: BriefItem[],
  now: Date,
  timezone: string,
): string {
  const remaining = remainingOf(items, now);
  if (remaining.length === 0) {
    return "Après-midi calme : il ne reste rien de prévu aujourd'hui. Une idée à me confier, ou une tâche à lancer ?";
  }
  return [greeting, ...describeAgenda(remaining, timezone)].join("\n");
}

/**
 * Le point du soir : le bilan de la journée, ce qui reste, le programme du soir,
 * puis un aperçu de demain. Chaque partie n'apparaît que si elle a quelque chose
 * à dire ; sans rien du tout, une phrase de calme.
 *
 * Les faits (titres, heures, comptes) viennent de l'agenda, jamais d'un modèle.
 */
export function eveningMessage(
  greeting: string,
  today: BriefItem[],
  tomorrow: BriefItem[],
  now: Date,
  timezone: string,
  bounds: DayPartBounds = DEFAULT_DAY_PART_BOUNDS,
): string {
  const open = today.filter((item) => !item.done);
  const done = today.length - open.length;

  // Le programme du soir : ce qui a une heure à partir du début du soir et n'est pas passé.
  const evening = remainingOf(open, now).filter(
    (item) =>
      !item.list &&
      !item.allDay &&
      toWall(new Date(item.startsAt), timezone).getUTCHours() >= bounds.eveningFrom,
  );
  const eveningIds = new Set(evening);
  const left = open.filter((item) => !eveningIds.has(item));
  const upcoming = tomorrow.filter((item) => !item.done);

  if (today.length === 0 && upcoming.length === 0) {
    return "Soirée calme : rien n'était prévu aujourd'hui, ni pour demain. Une idée à me confier pour la suite ?";
  }

  const lines = [greeting];
  if (today.length === 0) {
    lines.push("Journée tranquille : rien n'était prévu.");
  } else {
    lines.push(`Bilan : ${done} fait${done > 1 ? "s" : ""} sur ${today.length}.`);
  }
  if (left.length > 0) lines.push("Il reste à faire :", ...describeAgenda(left, timezone));
  if (evening.length > 0)
    lines.push("Au programme ce soir :", ...describeAgenda(evening, timezone));
  lines.push(
    upcoming.length > 0 ? "Demain :" : "Demain : rien de prévu pour l'instant.",
    ...describeAgenda(upcoming, timezone),
  );
  return lines.join("\n");
}
