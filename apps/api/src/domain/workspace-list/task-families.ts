import type { WorkspaceTask } from "@jc/domain";

type FamilyTask = Pick<WorkspaceTask, "id" | "parentId">;

/**
 * Ordre d'une liste où chaque sous-tâche suit sa tâche parente.
 *
 * Une sous-tâche ajoutée ou rattachée rejoint la fin de sa famille ; une tâche
 * remontée au premier niveau vient après l'ancienne famille. Les tâches de
 * premier niveau gardent l'ordre où elles se présentent, de même que les
 * sous-tâches entre elles : seul ce qui est hors de sa famille bouge.
 */
export function familyOrder(tasks: readonly FamilyTask[]): string[] {
  const roots = tasks.filter((task) => !task.parentId);
  const rootIds = new Set(roots.map((task) => task.id));
  const families = new Map(roots.map((task) => [task.id, [task.id]]));

  for (const task of tasks) {
    if (!task.parentId) continue;
    const family = rootIds.has(task.parentId) ? families.get(task.parentId) : undefined;
    // Un parent qui n'est plus là ne doit pas faire perdre la tâche : elle
    // prend la place d'une tâche de premier niveau.
    if (family) family.push(task.id);
    else families.set(task.id, [task.id]);
  }

  const first = new Set<string>();
  const order: string[] = [];
  for (const task of tasks) {
    const key = task.parentId && rootIds.has(task.parentId) ? task.parentId : task.id;
    if (first.has(key)) continue;
    first.add(key);
    order.push(...(families.get(key) ?? []));
  }
  return order;
}

/**
 * Un ordre demandé garde-t-il chaque sous-tâche juste après sa tâche parente,
 * ou après une autre sous-tâche de la même ?
 */
export function familiesStayTogether(
  tasks: readonly FamilyTask[],
  order: readonly string[],
): boolean {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  let current: string | null = null;

  for (const id of order) {
    const task = byId.get(id);
    if (!task) return false;
    if (!task.parentId) {
      current = id;
    } else if (task.parentId !== current) {
      return false;
    }
  }
  return true;
}
