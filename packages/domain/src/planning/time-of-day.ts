/**
 * Heure du jour au format « HH:MM » : la forme que les formulaires et l'API
 * échangent déjà.
 */

/** Pas des minutes dans le sélecteur d'heure : de 5 en 5, plus pratique qu'à la minute (Yann, 27 novembre). */
export const TIME_PICKER_MINUTE_STEP = 5;

const MINUTES_PER_DAY = 24 * 60;

/** Modulo qui reste positif : -1 modulo 24 vaut 23, pour boucler 00 → 23. */
export function wrapIndex(index: number, count: number): number {
  return ((index % count) + count) % count;
}

/**
 * L'heure arrondie au pas le plus proche, sur une horloge qui boucle : 14:58 au
 * pas de 5 donne 15:00, 23:58 donne 00:00. Une valeur illisible rend `null`.
 */
export function roundTimeToStep(
  value: string,
  step: number = TIME_PICKER_MINUTE_STEP,
): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  const total = wrapIndex(Math.round((hour * 60 + minute) / step) * step, MINUTES_PER_DAY);
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

/** `{ hour: 9, minute: 5 }` → « 09:05 ». */
export function formatTimeOfDay(time: { hour: number; minute: number }): string {
  return `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}
