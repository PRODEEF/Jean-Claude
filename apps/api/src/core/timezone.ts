import { logger } from "./logger.js";

/**
 * Conversions entre instant UTC et heure murale d'un fuseau.
 *
 * Utilitaire transverse : la recherche par période (A.6) et l'interprétation
 * de dates relatives (A.3) datent toutes deux quelque chose dans le fuseau du
 * profil, jamais en UTC ni dans celui du serveur.
 */

/**
 * Décalage du fuseau à un instant donné, en millisecondes.
 *
 * Obtenu en relisant l'heure murale rendue par `Intl` comme si elle était en
 * UTC : cela évite d'embarquer une table de fuseaux, `Intl` portant déjà celle
 * du système.
 */
export function offsetAt(instantMs: number, timeZone: string): number {
  const instant = new Date(instantMs);
  const zoned = new Date(instant.toLocaleString("en-US", { timeZone }));
  const utc = new Date(instant.toLocaleString("en-US", { timeZone: "UTC" }));
  return zoned.getTime() - utc.getTime();
}

/** Heure murale du fuseau, portée par un `Date` qu'on lit ensuite en UTC. */
export function toWall(instant: Date, timeZone: string): Date {
  return new Date(instant.getTime() + offsetAt(instant.getTime(), timeZone));
}

/**
 * Opération inverse : de l'heure murale vers l'instant UTC correspondant.
 *
 * Le décalage est estimé une première fois puis repris sur l'instant obtenu.
 * Sans cette seconde passe, une borne posée le week-end d'un changement
 * d'heure tomberait une heure à côté.
 */
export function fromWall(wallMs: number, timeZone: string): Date {
  const estimate = wallMs - offsetAt(wallMs, timeZone);
  return new Date(wallMs - offsetAt(estimate, timeZone));
}

/** Décale une heure murale (en ms UTC-portées) d'un nombre de jours. */
export function shiftDays(wallMs: number, days: number): number {
  return wallMs + days * 86_400_000;
}

/**
 * `iso` porte-t-il une heure murale précise dans `timezone`, ou tombe-t-il
 * pile à minuit — la convention en usage côté client (`momentOf`,
 * `TaskListDialog`) comme côté serveur pour dire « dans la journée, sans
 * créneau » ?
 */
export function hasWallTime(iso: string, timezone: string): boolean {
  const wall = toWall(new Date(iso), timezone);
  return wall.getUTCHours() !== 0 || wall.getUTCMinutes() !== 0;
}

function calendarDayUtc(iso: string, timezone: string): number {
  const wall = toWall(new Date(iso), timezone);
  return Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
}

/**
 * L'instant tombe-t-il sur un jour civil déjà révolu dans `timezone` ?
 *
 * Compare des jours, pas des heures : une échéance « aujourd'hui à 9h »
 * reste valable à 15h, une échéance « hier » ne l'est plus. C'est la
 * contrainte d'un agenda qui se remplit vers le futur.
 */
export function isPastCalendarDay(iso: string, timezone: string, now = new Date()): boolean {
  const wallNow = toWall(now, timezone);
  const today = Date.UTC(wallNow.getUTCFullYear(), wallNow.getUTCMonth(), wallNow.getUTCDate());
  return calendarDayUtc(iso, timezone) < today;
}

/** Deux instants tombent-ils le même jour civil dans `timezone` ? */
export function isSameCalendarDay(a: string, b: string, timezone: string): boolean {
  return calendarDayUtc(a, timezone) === calendarDayUtc(b, timezone);
}

/**
 * Jour civil `AAAA-MM-JJ` où tombe l'instant dans `timezone` — la forme des
 * échéances de tâche, qui visent un jour et non une heure.
 */
export function calendarDateIn(instant: Date, timezone: string): string {
  return toWall(instant, timezone).toISOString().slice(0, 10);
}

/** Date ISO sans décalage : `2026-09-30`, `2026-09-30T14:00`, `2026-09-30T14:00:00.000`. */
const NAIVE_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;

/**
 * Instant qu'un `startsAt` du modèle désigne, en ISO canonique — `null` s'il
 * est illisible.
 *
 * Une date sans décalage (`2026-09-30T14:00`) est l'heure murale de
 * l'utilisateur : c'est ce qu'il a dit (« à 14h ») et ce que la consigne de
 * l'outil demande. `new Date` la lisait dans le fuseau du serveur — UTC sur
 * Vercel —, et le rendez-vous tombait à 16h à Paris. Elle est donc posée dans
 * le fuseau du profil. Une valeur qui porte son décalage (`Z`, `+02:00`) est
 * prise telle quelle : le modèle a alors dit lui-même de quelle heure il parle.
 */
export function instantFromModel(value: string, timeZone: string): string | null {
  const naive = NAIVE_ISO.exec(value.trim());
  if (naive) {
    const [, year, month, day, hours = "0", minutes = "0", seconds = "0"] = naive;
    const wallMs = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds),
    );
    return Number.isNaN(wallMs) ? null : fromWall(wallMs, timeZone).toISOString();
  }

  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

/** Défaut du schéma des préférences (`userPreferencesSchema`). */
const FALLBACK_TIMEZONE = "Europe/Paris";

/**
 * Instant rendu en français dans le fuseau de l'utilisateur.
 *
 * Un fuseau invalide en base ferait lever `Intl` et emporterait le tour de
 * dialogue avec lui : on retombe alors sur le fuseau par défaut du schéma, en
 * le signalant.
 */
export function formatInstant(
  instant: Date,
  timezone: string,
  precision: "date" | "full" = "full",
): string {
  const options: Intl.DateTimeFormatOptions =
    precision === "date" ? { dateStyle: "full" } : { dateStyle: "full", timeStyle: "short" };

  try {
    return new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: timezone }).format(instant);
  } catch (error) {
    logger.warn(
      "core.timezone",
      "Fuseau horaire illisible, repli sur le défaut :",
      error instanceof Error ? error.message : error,
    );
    return new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: FALLBACK_TIMEZONE }).format(
      instant,
    );
  }
}
