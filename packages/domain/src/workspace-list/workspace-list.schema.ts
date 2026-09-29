import { z } from "zod";
import { isoDateTimeSchema, labelSchema, uuidSchema } from "../shared/primitives";

/**
 * Listes partagées d'un espace d'équipe — voir docs/COLLABORATION.md.
 *
 * Plus simples que les todolistes personnelles : un titre, des tâches
 * cochables par tous, un responsable par tâche. Ni échéance, ni sous-tâche,
 * ni calendrier.
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
  position: z.number().int(),
  createdAt: isoDateTimeSchema,
});
export type WorkspaceTask = z.infer<typeof workspaceTaskSchema>;

export const workspaceTaskListSchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  title: z.string(),
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
  folderId: uuidSchema.nullable().optional(),
  tasks: z.array(newTaskSchema).max(WORKSPACE_LIST_MAX_INITIAL_TASKS).default([]),
});
export type CreateWorkspaceTaskList = z.infer<typeof createWorkspaceTaskListSchema>;

export const updateWorkspaceTaskListSchema = z.object({
  title: labelSchema.optional(),
  folderId: uuidSchema.nullable().optional(),
});
export type UpdateWorkspaceTaskList = z.infer<typeof updateWorkspaceTaskListSchema>;

export const createWorkspaceTaskSchema = newTaskSchema;
export type CreateWorkspaceTask = z.infer<typeof createWorkspaceTaskSchema>;

export const updateWorkspaceTaskSchema = z.object({
  title: labelSchema.optional(),
  done: z.boolean().optional(),
  assigneeId: uuidSchema.nullable().optional(),
});
export type UpdateWorkspaceTask = z.infer<typeof updateWorkspaceTaskSchema>;

export const listWorkspaceTaskListsQuerySchema = z.object({ workspaceId: uuidSchema });
