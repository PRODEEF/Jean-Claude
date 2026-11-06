import { z } from "zod";
import { isoDateTimeSchema, labelSchema, uuidSchema } from "../shared/primitives";
import { taskListKindSchema } from "../task/task.schema";

/**
 * Listes partagées d'un espace d'équipe — voir docs/COLLABORATION.md.
 *
 * Plus simples que les todolistes personnelles : un titre, un type, une
 * échéance, des tâches cochables par tous, un responsable par tâche. Pas encore
 * de sous-tâche, ni de créneau d'agenda.
 */

/** Tâches d'une liste créée d'un coup — par Jean-Claude notamment. */
export const WORKSPACE_LIST_MAX_INITIAL_TASKS = 50;

export const workspaceTaskSchema = z.object({
  id: uuidSchema,
  listId: uuidSchema,
  title: z.string(),
  done: z.boolean(),
  /** Le responsable ; `null` = personne en particulier. */
  assigneeId: uuidSchema.nullable(),
  /** La tâche dont celle-ci est une sous-tâche ; `null` pour une tâche de premier niveau. */
  parentId: uuidSchema.nullable(),
  position: z.number().int(),
  createdAt: isoDateTimeSchema,
});
export type WorkspaceTask = z.infer<typeof workspaceTaskSchema>;

export const workspaceTaskListSchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  title: z.string(),
  /** Liste de tâches ou liste d'achats, comme une liste personnelle. */
  kind: taskListKindSchema,
  /** Échéance de la liste entière, comme une liste personnelle. */
  dueAt: isoDateTimeSchema.nullable(),
  /**
   * Journée ou créneau : enregistré plutôt que redéduit de l'heure de `dueAt`,
   * que chaque appareil lit dans son fuseau. `null` sans échéance.
   */
  dueAllDay: z.boolean().nullable(),
  /** Un seul dossier de l'espace, comme une liste personnelle. */
  folderId: uuidSchema.nullable(),
  /** Conversation d'où vient la liste, quand Jean-Claude l'a proposée. */
  conversationId: uuidSchema.nullable(),
  /** Dans l'ordre de la liste. */
  tasks: z.array(workspaceTaskSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type WorkspaceTaskList = z.infer<typeof workspaceTaskListSchema>;

const newTaskSchema = z.object({
  title: labelSchema,
  assigneeId: uuidSchema.nullable().optional(),
});

export const createWorkspaceTaskListSchema = z.object({
  workspaceId: uuidSchema,
  title: labelSchema,
  kind: taskListKindSchema.optional(),
  dueAt: isoDateTimeSchema.nullable().optional(),
  dueAllDay: z.boolean().optional(),
  folderId: uuidSchema.nullable().optional(),
  tasks: z.array(newTaskSchema).max(WORKSPACE_LIST_MAX_INITIAL_TASKS).default([]),
});
export type CreateWorkspaceTaskList = z.infer<typeof createWorkspaceTaskListSchema>;

export const updateWorkspaceTaskListSchema = z.object({
  title: labelSchema.optional(),
  kind: taskListKindSchema.optional(),
  dueAt: isoDateTimeSchema.nullable().optional(),
  dueAllDay: z.boolean().optional(),
  folderId: uuidSchema.nullable().optional(),
});
export type UpdateWorkspaceTaskList = z.infer<typeof updateWorkspaceTaskListSchema>;

export const createWorkspaceTaskSchema = newTaskSchema.extend({
  /** Crée la tâche comme sous-tâche de celle-ci, en fin de sa famille. */
  parentId: uuidSchema.nullable().optional(),
});
export type CreateWorkspaceTask = z.infer<typeof createWorkspaceTaskSchema>;

export const updateWorkspaceTaskSchema = z.object({
  title: labelSchema.optional(),
  done: z.boolean().optional(),
  assigneeId: uuidSchema.nullable().optional(),
  /** Une tâche parente en fait une sous-tâche ; `null` la remonte au premier niveau. */
  parentId: uuidSchema.nullable().optional(),
});
export type UpdateWorkspaceTask = z.infer<typeof updateWorkspaceTaskSchema>;

/**
 * Nouvel ordre des tâches d'une liste : tous les identifiants, dans l'ordre voulu.
 *
 * La liste entière plutôt qu'un déplacement : le serveur n'a pas à deviner d'où
 * vient la tâche, et un ordre qui ne correspond plus à la liste (un autre membre
 * a ajouté ou retiré une tâche) se reconnaît et se refuse.
 */
export const reorderWorkspaceTasksSchema = z.object({
  taskIds: z.array(uuidSchema).min(1).max(500),
});
export type ReorderWorkspaceTasks = z.infer<typeof reorderWorkspaceTasksSchema>;

export const listWorkspaceTaskListsQuerySchema = z.object({ workspaceId: uuidSchema });
