import type { CalendarEvent, CalendarRange } from "@jc/domain";
import { RRule } from "rrule";
import { logger } from "../../core/logger.js";

/**
 * Garde-fou : une règle « tous les jours » sur une fenêtre d'un an ne doit pas
 * produire plus d'occurrences que ce qu'une vue peut afficher.
 */
const MAX_OCCURRENCES = 400;

/**
 * Occurrences d'un événement dans la fenêtre demandée.
 *
 * Un événement ponctuel se rend tel quel. Une série est dépliée : chaque
 * occurrence garde l'identifiant de la série (la modifier ou la supprimer agit
 * sur toute la série) et la durée du premier créneau. « Sauf en février »
 * s'écrit dans la règle elle-même (`BYMONTH`), sans exception à stocker à part.
 *
 * Les dates sont dépliées en UTC : un créneau proche de minuit local peut
 * changer de jour lors d'un passage à l'heure d'été. Limite connue, à traiter
 * avec les fuseaux de l'utilisateur.
 */
export function occurrencesInRange(event: CalendarEvent, range: CalendarRange): CalendarEvent[] {
  if (!event.rrule) return [event];

  const start = new Date(event.startsAt);
  const durationMs = event.endsAt ? new Date(event.endsAt).getTime() - start.getTime() : 0;

  let rule: RRule;
  try {
    rule = new RRule({ ...RRule.parseString(event.rrule), dtstart: start });
  } catch (error) {
    // Une règle illisible ne doit pas faire disparaître le rendez-vous.
    logger.warn(
      "calendar",
      `Règle de récurrence illisible pour ${event.id} : ${error instanceof Error ? error.message : "inconnue"}`,
    );
    return [event];
  }

  // Une occurrence commencée avant la fenêtre qui s'y prolonge reste visible.
  const from = new Date(new Date(range.from).getTime() - durationMs);
  return rule
    .between(from, new Date(range.to), true)
    .filter((date) => date.getTime() < new Date(range.to).getTime())
    .slice(0, MAX_OCCURRENCES)
    .map((date) => ({
      ...event,
      startsAt: date.toISOString(),
      endsAt: event.endsAt ? new Date(date.getTime() + durationMs).toISOString() : null,
    }));
}
