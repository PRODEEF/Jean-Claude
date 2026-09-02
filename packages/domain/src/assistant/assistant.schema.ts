import { z } from "zod";
import { folderPurposeSchema } from "../folder/folder.schema";
import { isoDateTimeSchema, labelSchema, uuidSchema } from "../shared/primitives";
import { taskListKindSchema } from "../task/task.schema";

/**
 * Périmètre du canal permanent Jean-Claude (A.10).
 *
 * Chaque capacité est activable indépendamment depuis les paramètres, pour que
 * l'utilisateur garde la main sur ce que l'assistant fait de sa propre initiative.
 * Une capacité désactivée n'est pas seulement masquée dans l'UI : le serveur
 * refuse de produire la suggestion correspondante.
 */
export const assistantScopeSchema = z.object({
  /** Rappels du matin (jour) et du lundi (semaine). */
  morningReminders: z.boolean().default(true),
  /** Aide au rangement : proposer un dossier, corriger un classement. */
  folderOrganization: z.boolean().default(true),
  /** Suggestions d'évolution de la structure du projet. */
  structureSuggestions: z.boolean().default(true),
  /** Détection proactive de todolistes au fil des conversations (§12.1). */
  proactiveTaskDetection: z.boolean().default(true),
  /** Création d'événements datés à partir d'échéances mentionnées (A.3). */
  proactiveScheduling: z.boolean().default(true),
});

export type AssistantScope = z.infer<typeof assistantScopeSchema>;

/**
 * Nature d'une suggestion proactive (§12.1, A.8).
 *
 * L'assistant *propose*, il n'exécute jamais directement : chaque suggestion
 * est persistée en attente puis acceptée ou ignorée d'un geste par l'utilisateur.
 * C'est la garantie du « suggestif et non intrusif » demandé au §12.1.
 */
export const suggestionKindSchema = z.enum([
  /** « On dirait qu'une liste de tâches se dessine, je te l'organise ? » (§12.1, A.2) */
  "create_task_list",
  /** « Tu veux qu'on prévoie un créneau ce week-end ? » (A.3) */
  "schedule_task",
  /** « Je range cette conversation dans Santé et Administratif ? » (A.1) */
  "assign_folders",
  /** « Je crée les sous-dossiers IDÉE / TODO / ACHAT / RDV pour ce projet ? » (A.4) */
  "create_project_folders",
  /** « J'ai noté kiné tous les mardis à 18h, je pose le rappel ? » (A.11) */
  "create_recurring_event",
]);

export type SuggestionKind = z.infer<typeof suggestionKindSchema>;

export const suggestionStatusSchema = z.enum(["pending", "accepted", "dismissed", "expired"]);
export type SuggestionStatus = z.infer<typeof suggestionStatusSchema>;

export const suggestionSchema = z.object({
  id: uuidSchema,
  kind: suggestionKindSchema,
  status: suggestionStatusSchema,
  /** Conversation qui a déclenché la suggestion. */
  conversationId: uuidSchema.nullable(),
  /** Formulation affichée à l'utilisateur, rédigée par l'assistant. */
  message: z.string().min(1).max(500),
  /**
   * Charge utile de l'action à exécuter si l'utilisateur accepte.
   * Sa forme dépend de `kind` — validée côté serveur au moment de l'acceptation
   * plutôt qu'ici, pour que l'ajout d'un nouveau type de suggestion ne casse
   * pas la lecture des suggestions déjà stockées.
   */
  payload: z.record(z.unknown()),
  createdAt: isoDateTimeSchema,
  resolvedAt: isoDateTimeSchema.nullable(),
});

export type Suggestion = z.infer<typeof suggestionSchema>;

/** Dossier proposé par l'assistant, tel qu'il apparaît dans la carte de suggestion. */
const proposedFolderSchema = z.object({
  name: labelSchema,
  purpose: folderPurposeSchema.default("generic"),
});

/**
 * Charge utile d'une suggestion `create_project_folders` (A.4).
 *
 * Deux niveaux, là où l'arborescence en autorise `MAX_FOLDER_DEPTH` : le motif
 * de l'A.4 est un projet et ses rubriques (IDÉE, TODO, ACHAT, PRENDRE RDV), pas
 * une hiérarchie libre. Cette borne est un choix produit, pas une contrainte de
 * schéma — l'utilisateur reste libre d'imbriquer davantage à la main.
 */
export const createProjectFoldersPayloadSchema = z.object({
  folders: z
    .array(
      proposedFolderSchema.extend({
        // `strict()` sur l'enfant : un sous-dossier qui porterait lui-même des
        // enfants fait échouer la validation au lieu d'être silencieusement
        // élagué. Créer moins que ce que la proposition annonce serait pire
        // que de renoncer à la proposition.
        children: z.array(proposedFolderSchema.strict()).max(8).default([]),
      }),
    )
    .min(1)
    .max(8),
});

export type CreateProjectFoldersPayload = z.infer<typeof createProjectFoldersPayloadSchema>;

/**
 * Charge utile d'une suggestion `assign_folders` (A.1).
 *
 * Deux listes et non une : l'assistant peut ranger dans des dossiers qui
 * existent déjà **et** en proposer de nouveaux dans le même geste. Une
 * conversation appartient à plusieurs dossiers à la fois — ce n'est pas une
 * duplication, c'est la même donnée vue de plusieurs endroits (§5.2).
 */
export const assignFoldersPayloadSchema = z
  .object({
    existingFolderIds: z.array(uuidSchema).max(8).default([]),
    newFolderNames: z.array(labelSchema).max(8).default([]),
  })
  .refine(
    (payload) => payload.existingFolderIds.length + payload.newFolderNames.length > 0,
    "Un rangement sans dossier n'a rien à appliquer.",
  );

export type AssignFoldersPayload = z.infer<typeof assignFoldersPayloadSchema>;

/**
 * Réponse de l'utilisateur à une proposition (§12.1).
 *
 * `folderSelection` porte les dossiers cochés dans la carte de rangement :
 * une conversation appartient à plusieurs dossiers, et l'utilisateur doit
 * pouvoir n'en retenir qu'une partie sans refuser toute la proposition
 * (§5.2, A.1). Même forme que la charge utile, parce que c'en est un
 * sous-ensemble : le serveur n'applique que ce qui avait été proposé, jamais
 * un dossier venu du client. Absente, la proposition s'applique en entier —
 * le cas des natures qui n'ont rien à cocher.
 */
export const resolveSuggestionSchema = z.object({
  action: z.enum(["accept", "dismiss"]),
  folderSelection: assignFoldersPayloadSchema.optional(),
});

export type ResolveSuggestion = z.infer<typeof resolveSuggestionSchema>;

/**
 * Tâche proposée dans une todoliste (§12.1).
 *
 * `dueAt` retombe sur `null` au lieu de faire échouer la validation : le
 * modèle rend parfois une échéance inexploitable — « lundi prochain » laissé
 * en clair, une date sans fuseau. Perdre la liste entière pour une ligne mal
 * datée coûterait plus cher que de la proposer sans échéance.
 */
const proposedTaskSchema = z.object({
  title: labelSchema,
  dueAt: isoDateTimeSchema.nullable().catch(null),
});

/**
 * Charge utile d'une suggestion `create_task_list` (§12.1, A.2).
 *
 * Plusieurs listes et non une seule : l'exemple du jardin en produit deux —
 * les achats et les tâches — et les fusionner reviendrait à rendre une liste
 * de courses illisible au milieu du désherbage.
 */
export const createTaskListsPayloadSchema = z.object({
  lists: z
    .array(
      z.object({
        title: labelSchema,
        kind: taskListKindSchema,
        items: z.array(proposedTaskSchema).min(1).max(30),
      }),
    )
    .min(1)
    .max(4),
});

export type CreateTaskListsPayload = z.infer<typeof createTaskListsPayloadSchema>;

/**
 * Charge utile d'une suggestion `schedule_task` (A.3).
 *
 * Les tâches y sont désignées par leur identifiant : la proposition naît après
 * la création des listes, quand les lignes existent déjà. Le titre est recopié
 * pour que la carte reste lisible sans avoir à recharger les listes.
 */
export const scheduleTasksPayloadSchema = z.object({
  tasks: z
    .array(
      z.object({
        listId: uuidSchema,
        taskId: uuidSchema,
        title: labelSchema,
        dueAt: isoDateTimeSchema,
      }),
    )
    .min(1)
    .max(20),
});

export type ScheduleTasksPayload = z.infer<typeof scheduleTasksPayloadSchema>;
