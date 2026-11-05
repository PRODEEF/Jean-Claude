import { z } from "zod";

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

/**
 * Heures où l'après-midi puis le soir commencent. Le matin va de minuit à la
 * première : une journée de nuit blanche n'a pas de « petit matin » à part.
 */
export type DayPartBounds = { afternoonFrom: number; eveningFrom: number };

/** Midi et 19h : le langage courant plutôt qu'un découpage égal. */
export const DEFAULT_DAY_PART_BOUNDS: DayPartBounds = { afternoonFrom: 12, eveningFrom: 19 };

/**
 * Heures qu'on peut choisir dans les réglages.
 *
 * Deux plages qui ne se chevauchent pas : l'après-midi commence toujours avant
 * le soir, sans règle croisée à vérifier ni à expliquer. Aussi larges que ce
 * qu'une journée de travail ou de nuit demande — quelqu'un qui commence à midi
 * ou dîne à 22h s'y retrouve.
 */
export const AFTERNOON_FROM_CHOICES = [10, 11, 12, 13, 14, 15] as const;
export const EVENING_FROM_CHOICES = [17, 18, 19, 20, 21, 22] as const;

export const dayPartBoundsSchema = z.object({
  afternoonFrom: z
    .number()
    .int()
    .min(AFTERNOON_FROM_CHOICES[0])
    .max(AFTERNOON_FROM_CHOICES[AFTERNOON_FROM_CHOICES.length - 1] ?? 15),
  eveningFrom: z
    .number()
    .int()
    .min(EVENING_FROM_CHOICES[0])
    .max(EVENING_FROM_CHOICES[EVENING_FROM_CHOICES.length - 1] ?? 22),
});

/**
 * Moment auquel appartient une heure locale (0 à 23).
 *
 * L'échéance enregistre une heure, pas un moment : le moment se déduit, de
 * sorte que choisir « soir » puis régler 10h ramène à « matin » sans second
 * champ à garder cohérent.
 */
export function dayPartOfHour(
  hour: number,
  bounds: DayPartBounds = DEFAULT_DAY_PART_BOUNDS,
): DayPart {
  if (hour < bounds.afternoonFrom) return "morning";
  if (hour < bounds.eveningFrom) return "afternoon";
  return "evening";
}

/**
 * Heure `HH:MM` posée quand on choisit un moment sans préciser l'heure.
 *
 * Elle appartient toujours au moment choisi, quelles que soient les bornes :
 * 9h le matin, deux heures après le début de l'après-midi, une heure après le
 * début du soir — chacune ramenée dans sa plage quand les bornes la serrent.
 * Avec 12h et 19h, cela donne 9h, 14h et 20h.
 */
export function dayPartDefaultTime(
  part: DayPart,
  bounds: DayPartBounds = DEFAULT_DAY_PART_BOUNDS,
): string {
  const hour =
    part === "morning"
      ? Math.min(9, bounds.afternoonFrom - 1)
      : part === "afternoon"
        ? Math.min(bounds.afternoonFrom + 2, bounds.eveningFrom - 1)
        : Math.min(bounds.eveningFrom + 1, 23);

  return `${String(hour).padStart(2, "0")}:00`;
}
