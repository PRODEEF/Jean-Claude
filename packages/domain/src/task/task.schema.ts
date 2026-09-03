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

/**
 * Profondeur maximale d'une todoliste : une tâche, et ses sous-tâches.
 *
 * Deux niveaux, comme Things 3 et Todoist (§4.2). Au-delà, une todoliste
 * devient un plan de projet, ce que le §13.4.4 écarte explicitement.
 */
export const MAX_TASK_DEPTH = 1;

export const taskListSchema = z.object({
  id: uuidSchema,
  title: labelSchema,
  kind: taskListKindSchema,
  /**
   * Échéance de la liste entière.
   *
   * Portée par la liste et non par ses lignes : « les courses avant samedi »
   * date la liste, pas le paquet de farine. À minuit pile, l'échéance ne vise
   * qu'un jour — c'est ce qui distingue « samedi » de « samedi à 14h ».
   */
  dueAt: isoDateTimeSchema.nullable(),
  /** Créneau posé dans l'agenda pour cette liste, le cas échéant (A.3, A.8). */
  eventId: uuidSchema.nullable(),
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
  /** Tâche dont celle-ci est une sous-tâche. `null` au premier niveau. */
  parentId: uuidSchema.nullable(),
  position: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type Task = z.infer<typeof taskSchema>;

export const createTaskSchema = z.object({
  title: labelSchema,
  notes: z.string().max(4_000).nullable().optional(),
  parentId: uuidSchema.nullable().optional(),
});

export type CreateTask = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema.partial().extend({
  done: z.boolean().optional(),
  position: z.number().int().nonnegative().optional(),
});

export type UpdateTask = z.infer<typeof updateTaskSchema>;

/**
 * Contenu complet d'une liste, tel que l'éditeur l'envoie (§13.4.1).
 *
 * L'éditeur se tient comme une zone de texte : une ligne vaut une tâche, et
 * l'indentation vaut la filiation. Il envoie donc l'état entier plutôt qu'un
 * geste à la fois — insérer une ligne au milieu décale toutes les suivantes,
 * ce qu'une suite d'appels unitaires ne saurait rendre sans laisser la liste
 * dans un état intermédiaire incohérent.
 *
 * `depth` et non `parentId` : c'est ce que l'éditeur manipule, et le serveur
 * en déduit la filiation à partir de la ligne de premier niveau qui précède.
 * L'`id` est absent des lignes qui viennent d'être tapées.
 */
export const replaceTasksSchema = z.object({
  items: z
    .array(
      z.object({
        id: uuidSchema.optional(),
        title: labelSchema,
        depth: z.number().int().min(0).max(MAX_TASK_DEPTH),
      }),
    )
    .max(200),
});

export type ReplaceTasks = z.infer<typeof replaceTasksSchema>;

export type TaskListWithTasks = TaskList & { tasks: Task[] };

/**
 * Création d'une liste.
 *
 * `folderId` est facultatif et le restera : l'utilisateur ne choisit jamais où
 * ranger au moment où il crée (§13.4.1). Le champ n'est renseigné que lorsque
 * la liste naît depuis un dossier, où le rangement est déjà exprimé.
 *
 * `dueAt`, lui, est bien de la saisie initiale : une liste ouverte depuis le
 * calendrier naît sur le jour affiché, et l'assistant date la liste qu'il
 * propose quand la conversation dit quand.
 */
export const createTaskListSchema = z.object({
  title: labelSchema,
  kind: taskListKindSchema.default("todo"),
  folderId: uuidSchema.nullable().optional(),
  dueAt: isoDateTimeSchema.nullable().optional(),
});

export type CreateTaskList = z.infer<typeof createTaskListSchema>;

export const updateTaskListSchema = createTaskListSchema.partial();

export type UpdateTaskList = z.infer<typeof updateTaskListSchema>;
