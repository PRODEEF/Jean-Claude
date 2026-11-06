import type {
  CreateWorkspaceTask,
  CreateWorkspaceTaskList,
  ReorderWorkspaceTasks,
  UpdateWorkspaceTask,
  UpdateWorkspaceTaskList,
  WorkspaceTask,
  WorkspaceTaskList,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import { hasWallTime, isPastCalendarDay, isSameCalendarDay } from "../../core/timezone.js";
import { familiesStayTogether, familyOrder } from "./task-families.js";
import type {
  IWorkspaceListRepository,
  WorkspaceListPatch,
} from "./workspace-list.repository.interface.js";

/**
 * Listes partagées d'un espace : tout membre crée, coche, confie et supprime.
 *
 * La base tient déjà le responsable dans l'espace et le dossier dans l'espace
 * (triggers) ; le service le vérifie avant pour rendre un message clair
 * plutôt qu'une erreur Postgres.
 */
export class WorkspaceListService {
  constructor(private readonly lists: IWorkspaceListRepository) {}

  async list(
    workspaceId: string,
    userId: string,
    accessToken: string,
  ): Promise<WorkspaceTaskList[]> {
    await this.requireWorkspaceMembers(workspaceId, userId, accessToken);
    return this.lists.findByWorkspace(workspaceId, accessToken);
  }

  async get(id: string, accessToken: string): Promise<WorkspaceTaskList> {
    const list = await this.lists.findById(id, accessToken);
    if (!list) throw httpError(404, "Liste introuvable.");
    return list;
  }

  /**
   * `conversationId` n'appartient pas à `CreateWorkspaceTaskList` : il est posé
   * par le serveur quand une proposition de Jean-Claude est acceptée, jamais
   * accepté d'un client.
   */
  async create(
    userId: string,
    input: CreateWorkspaceTaskList & { conversationId?: string | null },
    accessToken: string,
  ): Promise<WorkspaceTaskList> {
    const members = await this.requireWorkspaceMembers(input.workspaceId, userId, accessToken);
    input.tasks.forEach((task) => assertAssignee(task.assigneeId ?? null, members));
    if (input.folderId) await this.assertFolder(input.workspaceId, input.folderId, accessToken);
    const due = await this.resolveDue(userId, input.dueAt, input.dueAllDay, null, accessToken);

    return this.lists.create(
      userId,
      {
        workspaceId: input.workspaceId,
        title: input.title,
        kind: input.kind ?? "todo",
        dueAt: due?.dueAt ?? null,
        dueAllDay: due?.dueAllDay ?? null,
        folderId: input.folderId ?? null,
        conversationId: input.conversationId ?? null,
        tasks: input.tasks.map((task, position) => ({
          title: task.title,
          assigneeId: task.assigneeId ?? null,
          parentId: null,
          position,
        })),
      },
      accessToken,
    );
  }

  async update(
    userId: string,
    id: string,
    patch: UpdateWorkspaceTaskList,
    accessToken: string,
  ): Promise<WorkspaceTaskList> {
    const list = await this.get(id, accessToken);
    if (patch.folderId) await this.assertFolder(list.workspaceId, patch.folderId, accessToken);
    const due = await this.resolveDue(
      userId,
      patch.dueAt,
      patch.dueAllDay,
      list.dueAt,
      accessToken,
    );

    // Clé par clé : un `undefined` laisse la colonne intacte, un `null` l'efface.
    const resolved: WorkspaceListPatch = {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.folderId !== undefined ? { folderId: patch.folderId } : {}),
      ...(due ?? {}),
    };

    await this.lists.update(id, resolved, accessToken);
    return { ...list, ...resolved };
  }

  async delete(id: string, accessToken: string): Promise<void> {
    await this.get(id, accessToken);
    await this.lists.delete(id, accessToken);
  }

  async addTask(
    userId: string,
    listId: string,
    input: CreateWorkspaceTask,
    accessToken: string,
  ): Promise<WorkspaceTask> {
    const list = await this.get(listId, accessToken);
    const assigneeId = input.assigneeId ?? null;
    if (assigneeId) {
      assertAssignee(
        assigneeId,
        await this.lists.findWorkspaceMemberIds(list.workspaceId, accessToken),
      );
    }
    const parentId = input.parentId ?? null;
    if (parentId) assertCanParent(list, parentId, null);

    // En fin de liste : une tâche ajoutée à la main vient après les autres.
    const position = Math.max(-1, ...list.tasks.map((task) => task.position)) + 1;
    const task = await this.lists.addTask(
      userId,
      listId,
      { title: input.title, assigneeId, parentId, position },
      accessToken,
    );

    // Une sous-tâche rejoint la fin de sa famille, pas la fin de la liste.
    if (parentId) await this.keepFamilies(listId, [...list.tasks, task], accessToken);
    return task;
  }

  async updateTask(
    listId: string,
    taskId: string,
    patch: UpdateWorkspaceTask,
    accessToken: string,
  ): Promise<WorkspaceTask> {
    const list = await this.get(listId, accessToken);
    const existing = requireTask(list, taskId);
    if (patch.assigneeId) {
      assertAssignee(
        patch.assigneeId,
        await this.lists.findWorkspaceMemberIds(list.workspaceId, accessToken),
      );
    }
    if (patch.parentId) assertCanParent(list, patch.parentId, existing);

    const updated = await this.lists.updateTask(taskId, patch, accessToken);

    // Changer de parent déplace la tâche : elle va avec sa nouvelle famille.
    if (patch.parentId !== undefined) {
      const tasks = list.tasks.map((task) =>
        task.id === taskId ? { ...task, parentId: patch.parentId ?? null } : task,
      );
      await this.keepFamilies(listId, tasks, accessToken);
    }
    return updated;
  }

  /** Réécrit les positions si l'ordre actuel sépare une sous-tâche de sa tâche parente. */
  private async keepFamilies(
    listId: string,
    tasks: WorkspaceTask[],
    accessToken: string,
  ): Promise<void> {
    const order = familyOrder(tasks);
    if (order.every((id, index) => id === tasks[index]?.id)) return;
    await this.lists.setTaskPositions(listId, order, accessToken);
  }

  /**
   * Range les tâches de la liste dans l'ordre donné.
   *
   * L'ordre doit nommer exactement les tâches de la liste, chacune une fois :
   * si un autre membre en a ajouté ou retiré une entre-temps, l'ordre vu par
   * l'appelant est périmé, et l'appliquer reléguerait ou perdrait des lignes.
   */
  async reorderTasks(
    listId: string,
    input: ReorderWorkspaceTasks,
    accessToken: string,
  ): Promise<WorkspaceTaskList> {
    const list = await this.get(listId, accessToken);

    const known = new Set(list.tasks.map((task) => task.id));
    const asked = new Set(input.taskIds);
    if (asked.size !== input.taskIds.length) {
      throw httpError(400, "Une tâche ne peut figurer qu'une fois dans l'ordre.");
    }
    if (asked.size !== known.size || input.taskIds.some((id) => !known.has(id))) {
      throw httpError(409, "La liste a changé entre-temps : rechargez-la.");
    }

    // Une sous-tâche ne peut pas être lâchée loin de sa tâche parente : sans
    // quoi elle changerait de parent sans que personne l'ait voulu.
    if (!familiesStayTogether(list.tasks, input.taskIds)) {
      throw httpError(400, "Une sous-tâche doit rester sous sa tâche.");
    }

    await this.lists.setTaskPositions(listId, input.taskIds, accessToken);

    const byId = new Map(list.tasks.map((task) => [task.id, task]));
    return {
      ...list,
      tasks: input.taskIds.flatMap((id, position) => {
        const task = byId.get(id);
        return task ? [{ ...task, position }] : [];
      }),
    };
  }

  async deleteTask(listId: string, taskId: string, accessToken: string): Promise<void> {
    requireTask(await this.get(listId, accessToken), taskId);
    await this.lists.deleteTask(taskId, accessToken);
  }

  /**
   * Échéance telle qu'on l'enregistre, ou `null` quand la requête n'y touche pas.
   *
   * Même règle que les listes personnelles : jamais un jour déjà révolu dans le
   * fuseau du profil, sauf à garder celui que la liste porte déjà ; et, faute
   * qu'on dise « journée » ou « créneau », le moment se déduit de l'heure.
   * Un moment envoyé sans échéance est ignoré : il n'accompagne jamais rien.
   */
  private async resolveDue(
    userId: string,
    dueAt: string | null | undefined,
    dueAllDay: boolean | undefined,
    currentDueAt: string | null,
    accessToken: string,
  ): Promise<{ dueAt: string | null; dueAllDay: boolean | null } | null> {
    if (dueAt === undefined) return null;
    if (dueAt === null) return { dueAt: null, dueAllDay: null };

    const timezone = await this.lists.findTimezone(userId, accessToken);
    const kept = currentDueAt !== null && isSameCalendarDay(dueAt, currentDueAt, timezone);
    if (isPastCalendarDay(dueAt, timezone) && !kept) {
      throw httpError(400, "Une échéance ne peut pas être dans le passé.");
    }

    return { dueAt, dueAllDay: dueAllDay ?? !hasWallTime(dueAt, timezone) };
  }

  /** Un non-membre reçoit un 404 : il n'a pas à apprendre que l'espace existe. */
  private async requireWorkspaceMembers(
    workspaceId: string,
    userId: string,
    accessToken: string,
  ): Promise<string[]> {
    const members = await this.lists.findWorkspaceMemberIds(workspaceId, accessToken);
    if (!members.includes(userId)) throw httpError(404, "Espace introuvable.");
    return members;
  }

  private async assertFolder(workspaceId: string, folderId: string, accessToken: string) {
    const folders = await this.lists.findWorkspaceFolderIds(workspaceId, accessToken);
    if (!folders.includes(folderId)) {
      throw httpError(400, "Ce dossier n'appartient pas à l'espace.");
    }
  }
}

function assertAssignee(assigneeId: string | null, members: string[]): void {
  if (assigneeId && !members.includes(assigneeId)) {
    throw httpError(400, "Le responsable choisi ne fait pas partie de l'espace.");
  }
}

/**
 * Peut-on rattacher `task` (ou une tâche à créer, `null`) à `parentId` ?
 * Un seul niveau de sous-tâches, comme dans les listes personnelles.
 */
function assertCanParent(
  list: WorkspaceTaskList,
  parentId: string,
  task: WorkspaceTask | null,
): void {
  const parent = list.tasks.find((candidate) => candidate.id === parentId);
  if (!parent) throw httpError(400, "La tâche parente n'est pas dans cette liste.");
  if (parent.parentId) throw httpError(400, "Une sous-tâche ne peut pas avoir de sous-tâche.");
  if (!task) return;

  if (task.id === parentId) throw httpError(400, "Une tâche ne peut pas être sa propre parente.");
  if (list.tasks.some((candidate) => candidate.parentId === task.id)) {
    throw httpError(400, "Cette tâche a des sous-tâches : elle ne peut pas en devenir une.");
  }
}

function requireTask(list: WorkspaceTaskList, taskId: string): WorkspaceTask {
  const task = list.tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw httpError(404, "Tâche introuvable.");
  return task;
}
