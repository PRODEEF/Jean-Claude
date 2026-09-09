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
