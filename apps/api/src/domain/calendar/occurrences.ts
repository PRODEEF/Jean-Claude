import type { CalendarEvent, CalendarRange } from "@jc/domain";
import * as rruleModule from "rrule";
import { logger } from "../../core/logger.js";

// `rrule` est un paquet CommonJS : l'API tourne en ESM, où un import nommé
// plante au démarrage de la fonction (« Named export not found ») et où la
// classe n'est lisible que sur `default`. Les tests, eux, tournent en
// CommonJS et la lisent directement : on essaie les deux. Le cast décrit la
// forme réelle de `default` dans le monde ESM, que les types ne connaissent pas.
const RRule =
  rruleModule.RRule ?? (rruleModule as unknown as { default: typeof rruleModule }).default.RRule;
type RRuleInstance = InstanceType<typeof RRule>;

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

  // Une occurrence commencée avant la fenêtre qui s'y prolonge reste visible.
  const dates = seriesDates(event.id, event.rrule, start, {
    from: new Date(new Date(range.from).getTime() - durationMs).toISOString(),
    to: range.to,
  });
  // Règle illisible : le rendez-vous reste visible, tel quel.
  if (dates === null) return [event];

  return dates.map((date) => ({
    ...event,
    startsAt: date.toISOString(),
    endsAt: event.endsAt ? new Date(date.getTime() + durationMs).toISOString() : null,
  }));
}

/**
 * Débuts des occurrences d'une série dans la fenêtre, ou `null` quand la règle
 * est illisible. Partagé avec les listes qui se répètent : une seule lecture de
 * la règle, donc un seul endroit où elle peut diverger.
 */
export function seriesDates(
  id: string,
  rrule: string,
  start: Date,
  range: CalendarRange,
): Date[] | null {
  let rule: RRuleInstance;
  try {
    rule = new RRule({ ...RRule.parseString(rrule), dtstart: start });
  } catch (error) {
    // Une règle illisible ne doit pas faire disparaître le rendez-vous.
    logger.warn(
      "calendar",
      `Règle de récurrence illisible pour ${id} : ${error instanceof Error ? error.message : "inconnue"}`,
    );
    return null;
  }

  return rule
    .between(new Date(range.from), new Date(range.to), true)
    .filter((date) => date.getTime() < new Date(range.to).getTime())
    .slice(0, MAX_OCCURRENCES);
}
