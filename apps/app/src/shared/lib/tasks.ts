import type { TaskListWithTasks } from "@jc/domain";

/**
 * Ce que les écrans de todolistes filtrent, cherchent et mesurent.
 *
 * Ce qui place une liste dans le temps — quel jour la porte, ce qui reste à y
 * faire, quelle liste le calendrier redessine — vit dans `@jc/domain` : ces
 * règles décident, et les quatre plateformes doivent en donner la même
 * réponse. Ne restent ici que le rangement par dossier, la recherche et les
 * mesures propres au rendu.
 */

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

/**
 * Retrait d'un niveau de sous-tâche, en points.
 *
 * Assez pour se lire, assez peu pour tenir sur un téléphone — un choix propre
 * à la todoliste, pas un jeton générique de `spacing`. Partagé entre
 * `TaskListEditor` et `TaskRow` pour que les deux rendus restent alignés.
 */
export const TASK_INDENT = 22;

/**
 * Hauteur de ligne et taille de case à cocher resserrées, en dessous de
 * MIN_TOUCH_TARGET (44 pt) — dérogation délibérée à la règle d'accessibilité
 * du projet (200-app.md), demandée pour une todoliste plus dense. Cocher reste
 * praticable ; la liste se lit avec des lignes plus rapprochées.
 */
export const TASK_ROW_HEIGHT = 32;
export const TASK_CHECKBOX_SIZE = 16;
