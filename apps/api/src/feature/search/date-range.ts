import type { DateShortcut } from "@jc/domain";

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

function shiftDays(wallMs: number, days: number): number {
  return wallMs + days * 86_400_000;
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

/**
 * Décalage du fuseau à un instant donné, en millisecondes.
 *
 * Obtenu en relisant l'heure murale rendue par `Intl` comme si elle était en
 * UTC : cela évite d'embarquer une table de fuseaux, `Intl` portant déjà celle
 * du système.
 */
function offsetAt(instantMs: number, timeZone: string): number {
  const instant = new Date(instantMs);
  const zoned = new Date(instant.toLocaleString("en-US", { timeZone }));
  const utc = new Date(instant.toLocaleString("en-US", { timeZone: "UTC" }));
  return zoned.getTime() - utc.getTime();
}

/** Heure murale du fuseau, portée par un `Date` qu'on lit ensuite en UTC. */
function toWall(instant: Date, timeZone: string): Date {
  return new Date(instant.getTime() + offsetAt(instant.getTime(), timeZone));
}

/**
 * Opération inverse : de l'heure murale vers l'instant UTC correspondant.
 *
 * Le décalage est estimé une première fois puis repris sur l'instant obtenu.
 * Sans cette seconde passe, une borne posée le week-end d'un changement
 * d'heure tomberait une heure à côté.
 */
function fromWall(wallMs: number, timeZone: string): Date {
  const estimate = wallMs - offsetAt(wallMs, timeZone);
  return new Date(wallMs - offsetAt(estimate, timeZone));
}
