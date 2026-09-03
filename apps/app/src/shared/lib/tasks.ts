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

/**
 * Tâches portant une échéance, toutes listes confondues.
 *
 * Celles à qui un créneau a été posé en sont exclues : leur événement les
 * représente déjà dans le calendrier, et les garder ici ferait apparaître la
 * même échéance deux fois le même jour (A.3).
 */
export function datedTasks(lists: TaskListWithTasks[]): DatedTask[] {
  return lists.flatMap(({ tasks, ...list }) =>
    tasks
      .filter((task) => task.dueAt !== null && task.eventId === null)
      .map((task) => ({ task, list })),
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

/** Tâches d'un même dossier. `folderId` à `null` : listes rangées nulle part. */
export type FolderTaskGroup = { folderId: string | null; tasks: DatedTask[] };

/**
 * Tâches regroupées par dossier de leur liste.
 *
 * L'ordre d'arrivée des dossiers est conservé — les tâches sont déjà triées par
 * échéance quand elles arrivent ici — et « sans dossier » passe en dernier :
 * c'est un reste, pas un dossier.
 */
export function groupByFolder(tasks: DatedTask[]): FolderTaskGroup[] {
  const byFolder = new Map<string | null, DatedTask[]>();

  for (const dated of tasks) {
    const existing = byFolder.get(dated.list.folderId);
    if (existing) existing.push(dated);
    else byFolder.set(dated.list.folderId, [dated]);
  }

  const groups = Array.from(byFolder, ([folderId, grouped]) => ({ folderId, tasks: grouped }));
  return [
    ...groups.filter((group) => group.folderId !== null),
    ...groups.filter((group) => group.folderId === null),
  ];
}

/**
 * Listes du dossier visé.
 *
 * Trois états et non deux : `undefined` ne filtre rien, `null` ne garde que les
 * listes rangées nulle part. « Tous les dossiers » n'est pas « aucun dossier ».
 */
export function filterListsByFolder(
  lists: TaskListWithTasks[],
  folderId: string | null | undefined,
): TaskListWithTasks[] {
  if (folderId === undefined) return lists;
  return lists.filter((list) => list.folderId === folderId);
}

/**
 * Dossiers qui portent au moins une liste — `null` s'il en existe une sans
 * dossier.
 *
 * Ce qui filtre les propositions du filtre : douze dossiers dont deux seulement
 * contiennent une liste donneraient dix boutons qui ne montrent rien.
 */
export function usedFolderIds(lists: TaskListWithTasks[]): Set<string | null> {
  return new Set(lists.map((list) => list.folderId));
}
