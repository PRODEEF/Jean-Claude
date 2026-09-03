import type { TaskListWithTasks } from "@jc/domain";
import { addDays, startOfDay } from "./dates";

/**
 * Listes portant une échéance, tous dossiers confondus.
 *
 * L'échéance appartient à la liste et non à ses lignes : « les courses avant
 * samedi » date la liste, pas la farine. La semaine et le calendrier lisent
 * donc des listes replacées dans le temps, pas des tâches éparpillées.
 */
export function datedLists(lists: TaskListWithTasks[]): TaskListWithTasks[] {
  return lists.filter((list) => list.dueAt !== null);
}

/**
 * Ce que le calendrier montre des todolistes.
 *
 * Les listes à qui un créneau a été posé en sont exclues : leur événement les
 * représente déjà, et les garder ferait apparaître la même échéance deux fois
 * le même jour (A.3).
 */
export function unscheduledLists(lists: TaskListWithTasks[]): TaskListWithTasks[] {
  return datedLists(lists).filter((list) => list.eventId === null);
}

export function listsOfDay(lists: TaskListWithTasks[], day: Date): TaskListWithTasks[] {
  const start = startOfDay(day).getTime();
  const end = addDays(startOfDay(day), 1).getTime();

  return lists.filter((list) => {
    const due = list.dueAt === null ? null : new Date(list.dueAt).getTime();
    return due !== null && due >= start && due < end;
  });
}

/**
 * Tâches restant à faire dans une liste.
 *
 * Ce qui est coché ne charge plus la journée : c'est ce décompte-là que le
 * calendrier affiche pour dire qu'un jour est chargé.
 */
export function openTaskCount(list: TaskListWithTasks): number {
  return list.tasks.filter((task) => !task.done).length;
}

/**
 * Ordre d'affichage d'une journée : les plus tôt d'abord.
 *
 * Comparaison de chaînes et non de dates : deux horodatages ISO du même fuseau
 * s'ordonnent déjà lexicographiquement, et l'API les rend tous en UTC.
 */
export function byDueDate(a: TaskListWithTasks, b: TaskListWithTasks): number {
  return (a.dueAt ?? "").localeCompare(b.dueAt ?? "");
}

/** Listes d'un même dossier. `folderId` à `null` : listes rangées nulle part. */
export type FolderListGroup = { folderId: string | null; lists: TaskListWithTasks[] };

/**
 * Listes regroupées par dossier.
 *
 * L'ordre d'arrivée des dossiers est conservé — les listes sont déjà triées par
 * échéance quand elles arrivent ici — et « sans dossier » passe en dernier :
 * c'est un reste, pas un dossier.
 */
export function groupByFolder(lists: TaskListWithTasks[]): FolderListGroup[] {
  const byFolder = new Map<string | null, TaskListWithTasks[]>();

  for (const list of lists) {
    const existing = byFolder.get(list.folderId);
    if (existing) existing.push(list);
    else byFolder.set(list.folderId, [list]);
  }

  const groups = Array.from(byFolder, ([folderId, grouped]) => ({ folderId, lists: grouped }));
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

/**
 * Forme comparable d'un libellé : minuscules, sans accent.
 *
 * Chercher « reglement » doit trouver « Règlement ». La recherche se fait sur
 * ce qui est déjà chargé — toutes les listes tiennent dans un seul appel —
 * donc sans passer par le serveur : la réponse arrive à la frappe.
 */
function comparable(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Listes dont le titre, ou celui d'une de leurs tâches, contient la recherche. */
export function filterListsByQuery(lists: TaskListWithTasks[], query: string): TaskListWithTasks[] {
  const needle = comparable(query.trim());
  if (needle.length === 0) return lists;

  return lists.filter(
    (list) =>
      comparable(list.title).includes(needle) ||
      list.tasks.some((task) => comparable(task.title).includes(needle)),
  );
}

/** Un libellé répond-il à la recherche ? Sert à mettre une ligne en avant dans sa liste. */
export function titleMatchesQuery(title: string, query: string): boolean {
  const needle = comparable(query.trim());
  return needle.length > 0 && comparable(title).includes(needle);
}
