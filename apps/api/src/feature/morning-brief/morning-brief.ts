import { calendarDateIn, fromWall, shiftDays, toWall } from "../../core/timezone.js";
import { describeReminder } from "../reminders/reminder-message.js";

/**
 * Plage horaire locale où le point du matin peut partir : à partir de 8 h, et
 * jusqu'à midi pour rattraper un passage du planificateur manqué. Passé midi,
 * « bonjour, voici ta journée » n'a plus de sens : on ne l'envoie pas.
 */
export const BRIEF_FROM_HOUR = 8;
export const BRIEF_UNTIL_HOUR = 12;

/** Une chose prévue aujourd'hui : un rendez-vous ou une liste datée. */
export type BriefItem = {
  startsAt: string;
  allDay: boolean;
  title: string;
  /** Une liste (« à faire ») plutôt qu'un rendez-vous. */
  list: boolean;
};

/** Est-ce l'heure du point du matin, là où l'utilisateur se trouve ? */
export function isBriefTime(now: Date, timezone: string): boolean {
  const hour = toWall(now, timezone).getUTCHours();
  return hour >= BRIEF_FROM_HOUR && hour < BRIEF_UNTIL_HOUR;
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
export function fixedGreeting(displayName: string | null): string {
  return displayName ? `Bonjour ${displayName}, voici ta journée :` : "Bonjour, voici ta journée :";
}

/** Le message complet : une introduction, puis l'agenda du jour. */
export function briefMessage(greeting: string, items: BriefItem[], timezone: string): string {
  return [greeting, ...describeAgenda(items, timezone)].join("\n");
}
