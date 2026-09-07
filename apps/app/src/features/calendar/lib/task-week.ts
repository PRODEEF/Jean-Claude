import type { TaskListWithTasks } from "@jc/domain";
import { byDueDate, listsOfDay } from "@/shared/lib/tasks";

/**
 * Découpage d'une journée en moments.
 *
 * C'est la forme de la maquette — MATIN, APRÈM, SOIRÉE, SOIR — et celle dans
 * laquelle l'utilisateur écrit déjà ses journées. Le moment est déduit de
 * l'heure de l'échéance plutôt que stocké : demander « à quel moment ? » en
 * plus de « quand ? » ajouterait une question à chaque saisie (§13.4.1).
 */
export type MomentKey = "anytime" | "morning" | "afternoon" | "evening" | "night";

export type Moment = { key: MomentKey; label: string };

/** Ordre d'affichage, du plus vague au plus tardif. */
export const MOMENTS: Moment[] = [
  { key: "anytime", label: "Dans la journée" },
  { key: "morning", label: "Matin" },
  { key: "afternoon", label: "Après-midi" },
  { key: "evening", label: "Soirée" },
  { key: "night", label: "Soir" },
];

/** Bornes en heures locales, celles du langage courant plutôt que d'un découpage égal. */
const AFTERNOON_FROM = 12;
const EVENING_FROM = 18;
const NIGHT_FROM = 22;

/**
 * Moment d'une échéance.
 *
 * Minuit pile vaut « dans la journée » et non « matin » : c'est l'heure que
 * porte une liste datée sans heure précise, et l'annoncer à 0h laisserait
 * croire à un rendez-vous nocturne.
 */
export function momentOf(dueAt: string): MomentKey {
  const date = new Date(dueAt);
  const hours = date.getHours();

  if (hours === 0 && date.getMinutes() === 0) return "anytime";
  if (hours >= NIGHT_FROM) return "night";
  if (hours >= EVENING_FROM) return "evening";
  if (hours >= AFTERNOON_FROM) return "afternoon";
  return "morning";
}

export type MomentGroup = { moment: Moment; lists: TaskListWithTasks[] };

/**
 * Listes échues ce jour-là, regroupées par moment.
 *
 * Les moments vides sont écartés : sept jours × cinq moments rempliraient la
 * semaine de « rien de prévu » et noieraient ce qui s'y passe vraiment.
 */
export function momentsOfDay(lists: TaskListWithTasks[], day: Date): MomentGroup[] {
  const ofDay = listsOfDay(lists, day).sort(byDueDate);

  return MOMENTS.map((moment) => ({
    moment,
    lists: ofDay.filter((list) => list.dueAt !== null && momentOf(list.dueAt) === moment.key),
  })).filter((group) => group.lists.length > 0);
}
