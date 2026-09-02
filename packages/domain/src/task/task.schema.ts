import { z } from "zod";
import { isoDateTimeSchema, labelSchema, uuidSchema } from "../shared/primitives";

/**
 * Nature d'une liste (§12.1).
 *
 * L'exemple du jardin le montre : une même conversation produit deux listes
 * de natures différentes — une liste d'achats et une liste de tâches. Elles
 * doivent rester distinctes plutôt que fusionnées dans une todoliste unique.
 */
export const taskListKindSchema = z.enum(["todo", "shopping"]);
export type TaskListKind = z.infer<typeof taskListKindSchema>;

export const taskListSchema = z.object({
  id: uuidSchema,
  title: labelSchema,
  kind: taskListKindSchema,
  /** Conversation d'origine, quand la liste vient d'une conversion (A.2). */
  conversationId: uuidSchema.nullable(),
  /** Dossier thématique de rattachement — la liste y reste visible (A.2). */
  folderId: uuidSchema.nullable(),
  createdByAssistant: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type TaskList = z.infer<typeof taskListSchema>;

export const taskSchema = z.object({
  id: uuidSchema,
  listId: uuidSchema,
  title: labelSchema,
  notes: z.string().max(4_000).nullable(),
  done: z.boolean(),
  completedAt: isoDateTimeSchema.nullable(),
  /** Échéance déduite de la conversation (A.3) ou posée par l'utilisateur. */
  dueAt: isoDateTimeSchema.nullable(),
  /** Événement calendrier créé à partir de la tâche, le cas échéant (A.3, A.8). */
  eventId: uuidSchema.nullable(),
  position: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type Task = z.infer<typeof taskSchema>;

export const createTaskSchema = z.object({
  title: labelSchema,
  notes: z.string().max(4_000).nullable().optional(),
  dueAt: isoDateTimeSchema.nullable().optional(),
});

export type CreateTask = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema.partial().extend({
  done: z.boolean().optional(),
  position: z.number().int().nonnegative().optional(),
});

export type UpdateTask = z.infer<typeof updateTaskSchema>;

export type TaskListWithTasks = TaskList & { tasks: Task[] };

/**
 * Création d'une liste.
 *
 * `folderId` est facultatif et le restera : l'utilisateur ne choisit jamais où
 * ranger au moment où il crée (§13.4.1). Le champ n'est renseigné que lorsque
 * la liste naît depuis un dossier, où le rangement est déjà exprimé.
 */
export const createTaskListSchema = z.object({
  title: labelSchema,
  kind: taskListKindSchema.default("todo"),
  folderId: uuidSchema.nullable().optional(),
});

export type CreateTaskList = z.infer<typeof createTaskListSchema>;

export const updateTaskListSchema = createTaskListSchema.partial();

export type UpdateTaskList = z.infer<typeof updateTaskListSchema>;
