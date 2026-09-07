import type { DateShortcut } from "@jc/domain";
import { fromWall, shiftDays, toWall } from "../../core/timezone.js";

/** Bornes en instants UTC : `from` inclusive, `to` exclusive. */
export type DateRange = { from?: string; to?: string };

/**
 * Traduit les filtres de date de la recherche en bornes UTC (A.6).
 *
 * Le calcul vit ici et non dans l'application : « le mois dernier » dépend du
 * fuseau de l'utilisateur, et les quatre plateformes doivent renvoyer la même
 * page de résultats. Un raccourci l'emporte sur des bornes explicites — c'est
 * ce que l'interface propose, l'un remplaçant l'autre.
 */
export function resolveDateRange(
  filters: {
    shortcut?: DateShortcut | undefined;
    from?: string | undefined;
    to?: string | undefined;
  },
  timeZone: string,
  now: Date = new Date(),
): DateRange {
  if (filters.shortcut) return resolveShortcut(filters.shortcut, timeZone, now);

  const range: DateRange = {};
  if (filters.from) range.from = startOfDay(filters.from, timeZone);
  // Borne haute exclusive : l'utilisateur qui saisit « au 3 mars » attend que
  // le 3 mars soit inclus, donc la coupure tombe au début du 4.
  if (filters.to) range.to = startOfDay(filters.to, timeZone, 1);
  return range;
}

function resolveShortcut(shortcut: DateShortcut, timeZone: string, now: Date): DateRange {
  const wall = toWall(now, timeZone);
  const year = wall.getUTCFullYear();
  const month = wall.getUTCMonth();
  const day = wall.getUTCDate();

  switch (shortcut) {
    case "this_week": {
      const start = startOfWeek(year, month, day);
      return bounds(start, shiftDays(start, 7), timeZone);
    }
    case "last_week": {
      const start = shiftDays(startOfWeek(year, month, day), -7);
      return bounds(start, shiftDays(start, 7), timeZone);
    }
    case "this_month":
      return bounds(Date.UTC(year, month, 1), Date.UTC(year, month + 1, 1), timeZone);
    case "last_month":
      return bounds(Date.UTC(year, month - 1, 1), Date.UTC(year, month, 1), timeZone);
    case "this_year":
      return bounds(Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1), timeZone);
    case "last_year":
      return bounds(Date.UTC(year - 1, 0, 1), Date.UTC(year, 0, 1), timeZone);
  }
}

/** Lundi de la semaine contenant la date donnée — la semaine française commence là. */
function startOfWeek(year: number, month: number, day: number): number {
  const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
  return Date.UTC(year, month, day - ((weekday + 6) % 7));
}

function bounds(fromWallMs: number, toWallMs: number, timeZone: string): DateRange {
  return {
    from: fromWall(fromWallMs, timeZone).toISOString(),
    to: fromWall(toWallMs, timeZone).toISOString(),
  };
}

function startOfDay(calendarDate: string, timeZone: string, plusDays = 0): string {
  const [year, month, day] = calendarDate.split("-").map(Number) as [number, number, number];
  return fromWall(Date.UTC(year, month - 1, day + plusDays), timeZone).toISOString();
}
