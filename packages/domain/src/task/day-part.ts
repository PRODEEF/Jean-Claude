/**
 * Moment de la journée : une façon de dater une liste sans inventer d'horaire
 * précis. « Le sport, ce matin » se dit plus naturellement que « à 9h ».
 *
 * Distinct du créneau d'agenda de `slotForList` : celui-là est le rendez-vous
 * que la liste projette dans le calendrier, celui-ci n'est qu'un raccourci pour
 * poser l'heure de son échéance.
 */
export const DAY_PARTS = ["morning", "afternoon", "evening"] as const;

export type DayPart = (typeof DAY_PARTS)[number];

/** Le matin s'arrête à midi : 12h00 est déjà l'après-midi. */
const AFTERNOON_STARTS_AT_HOUR = 12;

/** Le soir commence à 19h : 19h00 est déjà le soir. */
const EVENING_STARTS_AT_HOUR = 19;

/**
 * Moment auquel appartient une heure locale (0 à 23).
 *
 * L'échéance enregistre une heure, pas un moment : le moment se déduit, de
 * sorte que choisir « soir » puis régler 10h ramène à « matin » sans second
 * champ à garder cohérent.
 */
export function dayPartOfHour(hour: number): DayPart {
  if (hour < AFTERNOON_STARTS_AT_HOUR) return "morning";
  if (hour < EVENING_STARTS_AT_HOUR) return "afternoon";
  return "evening";
}

/**
 * Heure `HH:MM` posée quand on choisit un moment sans préciser l'heure.
 *
 * Au milieu de chaque plage, sauf le soir, qui commence tard : 20h plutôt que
 * 19h pile, pour qu'une liste « du soir » ne sorte pas du créneau à la moindre
 * retouche.
 */
export const DAY_PART_DEFAULT_TIME: Record<DayPart, string> = {
  morning: "09:00",
  afternoon: "14:00",
  evening: "20:00",
};
