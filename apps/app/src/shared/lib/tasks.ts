import type { Task, TaskList, TaskListWithTasks } from "@jc/domain";
import { addDays, startOfDay } from "./dates";

/**
 * Une tâche datée et la liste dont elle vient.
 *
 * La vue hebdomadaire comme le calendrier sortent les tâches de leurs listes
 * pour les replacer dans le temps : la liste d'origine doit les suivre, sans
 * quoi « Appeler le garage » n'apprend plus de quel projet il relève.
 */
export type DatedTask = { task: Task; list: TaskList };

/** Tâches portant une échéance, toutes listes confondues. */
export function datedTasks(lists: TaskListWithTasks[]): DatedTask[] {
  return lists.flatMap(({ tasks, ...list }) =>
    tasks.filter((task) => task.dueAt !== null).map((task) => ({ task, list })),
  );
}

export function tasksOfDay(tasks: DatedTask[], day: Date): DatedTask[] {
  const start = startOfDay(day).getTime();
  const end = addDays(startOfDay(day), 1).getTime();

  return tasks.filter(({ task }) => {
    const due = task.dueAt === null ? null : new Date(task.dueAt).getTime();
    return due !== null && due >= start && due < end;
  });
}

/**
 * Tâches restant à faire ce jour-là.
 *
 * Ce qui est coché ne charge plus la journée : c'est ce décompte-là que le
 * calendrier affiche pour dire qu'un jour est chargé.
 */
export function openTasksOfDay(tasks: DatedTask[], day: Date): DatedTask[] {
  return tasksOfDay(tasks, day).filter(({ task }) => !task.done);
}

/**
 * Ordre d'affichage d'une journée : les plus tôt d'abord.
 *
 * Comparaison de chaînes et non de dates : deux horodatages ISO du même fuseau
 * s'ordonnent déjà lexicographiquement, et l'API les rend tous en UTC.
 */
export function byDueDate(a: DatedTask, b: DatedTask): number {
  return (a.task.dueAt ?? "").localeCompare(b.task.dueAt ?? "");
}
