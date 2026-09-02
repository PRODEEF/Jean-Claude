/**
 * Lecture et écriture des dates et heures tapées à la main.
 *
 * Partagé par le formulaire d'événement et par celui d'échéance d'une tâche :
 * les deux acceptent exactement les mêmes formats, ce qu'une seconde
 * implémentation aurait fini par démentir.
 *
 * Tout est interprété dans le fuseau de l'appareil puis converti en UTC :
 * « 14h30 » veut dire 14h30 là où se trouve l'utilisateur, pas à Greenwich.
 */

export function formatDateInput(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

export function formatTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * Minuit local du jour saisi.
 *
 * Les deux échecs sont distingués : un format non reconnu et un jour qui
 * n'existe pas n'appellent pas la même correction de la part de qui saisit.
 */
export function parseDateInput(value: string): Date | "malformed" | "impossible" {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return "malformed";

  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);

  // `new Date(2026, 1, 31)` ne lève pas, il glisse au 3 mars : on refuse une
  // date qui ne s'est pas conservée à la construction.
  if (date.getDate() !== day || date.getMonth() !== month - 1) return "impossible";
  return date;
}

/** Accepte `14:30`, `14h30` et `14h`. */
export function parseTimeInput(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2})\s*[:hH]\s*(\d{2})?$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

export function withTime(day: Date, time: { hours: number; minutes: number }): string {
  const date = new Date(day);
  date.setHours(time.hours, time.minutes, 0, 0);
  return date.toISOString();
}
