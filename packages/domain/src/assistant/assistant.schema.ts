import { z } from "zod";
import { feedbackPlatformSchema, FEEDBACK_CONTENT_MAX_LENGTH } from "../feedback/feedback.schema";
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
  /** « J'ajoute le pain et les œufs à ta liste de courses ? » (§12.1, A.2) */
  "add_task_list_items",
  /** « Tu veux qu'on prévoie un créneau ce week-end ? » (A.3) */
  "schedule_task",
  /** « Je range cette conversation dans Santé et Administratif ? » (A.1) */
  "assign_folders",
  /** « Je crée les sous-dossiers IDÉE / TODO / ACHAT / RDV pour ce projet ? » (A.4) */
  "create_project_folders",
  /** « J'ai noté kiné tous les mardis à 18h, je pose le rappel ? » (A.11) */
  "create_recurring_event",
  /** « Je décale Courses à vendredi ? » (§12.1, A.2) */
  "update_task_list_due_date",
  /** « Je coche le pain et je renomme les œufs ? » (§12.1, A.2) */
  "update_task_list_items",
  /** « On dirait un bug, je le signale ? » (A.10) */
  "report_bug",
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
 * Nouveau dossier proposé par un rangement (A.1).
 *
 * `parentId` en fait un sous-dossier d'un dossier existant plutôt qu'un
 * nouveau dossier à la racine — vérifié comme n'importe quel dossier existant
 * repris dans la proposition (identifiant et nom recopiés de la même ligne)
 * avant d'atteindre ce schéma.
 */
const newFolderSchema = z.object({
  name: labelSchema,
  parentId: uuidSchema.optional(),
});

/**
 * Charge utile d'une suggestion `assign_folders` (A.1).
 *
 * Deux listes et non une : l'assistant peut ranger dans des dossiers qui
 * existent déjà **et** en proposer de nouveaux dans le même geste. Une
 * conversation appartient à plusieurs dossiers à la fois — ce n'est pas une
 * duplication, c'est la même donnée vue de plusieurs endroits (§5.2).
 *
 * Sert aussi bien le premier rangement d'une conversation que la révision
 * d'un rangement déjà fait : dans les deux cas, la charge utile porte
 * l'ensemble complet des dossiers visés, pas un ajout au rangement actuel —
 * un dossier qui n'y figure plus en est retiré.
 */
export const assignFoldersPayloadSchema = z
  .object({
    existingFolderIds: z.array(uuidSchema).max(8).default([]),
    newFolders: z.array(newFolderSchema).max(8).default([]),
  })
  .refine(
    (payload) => payload.existingFolderIds.length + payload.newFolders.length > 0,
    "Un rangement sans dossier n'a rien à appliquer.",
  );

export type AssignFoldersPayload = z.infer<typeof assignFoldersPayloadSchema>;

/**
 * Charge utile d'une suggestion `create_task_list` (§12.1, A.2).
 *
 * Plusieurs listes et non une seule : l'exemple du jardin en produit deux —
 * les achats et les tâches — et les fusionner reviendrait à rendre une liste
 * de courses illisible au milieu du désherbage.
 *
 * `dueAt` date la liste et non ses lignes : une échéance sortie d'une
 * conversation vaut pour ce qui est à boucler, pas pour un article de la
 * liste de courses. Elle retombe sur `null` au lieu de faire échouer la
 * validation — le modèle rend parfois une date inexploitable, « lundi
 * prochain » laissé en clair ou sans fuseau, et perdre la liste entière pour
 * cela coûterait plus cher que de la proposer sans échéance.
 */
export const createTaskListsPayloadSchema = z.object({
  lists: z
    .array(
      z.object({
        title: labelSchema,
        kind: taskListKindSchema,
        dueAt: isoDateTimeSchema.nullable().catch(null).default(null),
        items: z
          .array(z.object({ title: labelSchema }))
          .min(1)
          .max(30),
      }),
    )
    .min(1)
    .max(4),
});

export type CreateTaskListsPayload = z.infer<typeof createTaskListsPayloadSchema>;

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
 *
 * `taskListEdits` porte les listes relues et corrigées avant validation
 * (§13.4.1, #17) : contrairement au rangement, ce n'est pas un sous-ensemble
 * de la proposition — l'utilisateur peut y corriger un titre, pas seulement
 * en écarter une partie. Le même schéma que la proposition initiale suffit à
 * le border : ce n'est ni plus ni moins que ce qu'accepterait la création
 * d'une todoliste ordinaire.
 *
 * `bugReportContext` complète une proposition `report_bug` : `platform` et
 * `screen` ne sont connus que du client, jamais du modèle, contrairement au
 * texte du signalement — comme le contexte technique déjà joint
 * automatiquement à la fenêtre d'avis général (`useFeedbackContext`).
 */
export const resolveSuggestionSchema = z.object({
  action: z.enum(["accept", "dismiss"]),
  folderSelection: assignFoldersPayloadSchema.optional(),
  taskListEdits: createTaskListsPayloadSchema.optional(),
  bugReportContext: z
    .object({
      platform: feedbackPlatformSchema,
      screen: z.string().trim().min(1).max(120),
    })
    .optional(),
});

export type ResolveSuggestion = z.infer<typeof resolveSuggestionSchema>;

/**
 * Charge utile d'une suggestion `add_task_list_items` (§12.1, A.2).
 *
 * Compléter une liste plutôt qu'en ouvrir une seconde : « complète la liste »
 * désigne celle qui existe, et y répondre par une liste homonyme laisserait
 * l'utilisateur avec deux fois le même sujet. La liste est désignée par son
 * identifiant, repris de la consigne — le titre, lui, est déjà dans la phrase
 * que l'assistant adresse à l'utilisateur.
 */
export const addTaskListItemsPayloadSchema = z.object({
  listId: uuidSchema,
  items: z.array(z.object({ title: labelSchema })).min(1).max(30),
});

export type AddTaskListItemsPayload = z.infer<typeof addTaskListItemsPayloadSchema>;

/**
 * Charge utile d'une suggestion `schedule_task` (A.3).
 *
 * Les listes y sont désignées par leur identifiant : la proposition naît après
 * la création des listes, quand elles existent déjà. Le titre est recopié pour
 * que la carte reste lisible sans avoir à recharger les todolistes.
 */
export const scheduleListsPayloadSchema = z.object({
  lists: z
    .array(
      z.object({
        listId: uuidSchema,
        title: labelSchema,
        dueAt: isoDateTimeSchema,
      }),
    )
    .min(1)
    .max(8),
});

export type ScheduleListsPayload = z.infer<typeof scheduleListsPayloadSchema>;

/**
 * Charge utile d'une suggestion `update_task_list_due_date` (§12.1, A.2).
 *
 * `dueAt` seul, sans `null` : contrairement à la création, cet outil ne sert
 * qu'à déplacer une échéance vers une nouvelle date, jamais à l'effacer — un
 * geste distinct, que l'utilisateur fait depuis la fiche de la liste, pas
 * depuis une proposition de l'assistant.
 */
export const updateTaskListDueDatePayloadSchema = z.object({
  listId: uuidSchema,
  dueAt: isoDateTimeSchema,
});

export type UpdateTaskListDueDatePayload = z.infer<typeof updateTaskListDueDatePayloadSchema>;

/**
 * Charge utile d'une suggestion `update_task_list_items` (§12.1, A.2).
 *
 * Cocher, décocher ou renommer des lignes qui existent déjà — le geste que
 * `add_task_list_items` ne couvre pas. Sans lui, « coche le pain » n'avait
 * qu'un outil à sa portée, celui qui crée, et le modèle ouvrait une seconde
 * liste. Chaque ligne est désignée par son identifiant, repris de la consigne.
 *
 * Au moins un des deux champs `title` / `done` : une ligne sans rien à
 * changer n'a pas de proposition à porter.
 */
export const updateTaskListItemsPayloadSchema = z.object({
  listId: uuidSchema,
  items: z
    .array(
      z
        .object({
          taskId: uuidSchema,
          title: labelSchema.optional(),
          done: z.boolean().optional(),
        })
        .refine(
          (item) => item.title !== undefined || item.done !== undefined,
          "Une ligne à modifier doit au moins changer de titre ou d'état.",
        ),
    )
    .min(1)
    .max(30),
});

export type UpdateTaskListItemsPayload = z.infer<typeof updateTaskListItemsPayloadSchema>;

/**
 * Charge utile d'une suggestion `report_bug` (A.10).
 *
 * `content` seul à la capture : c'est tout ce que le modèle peut renseigner,
 * rédigé à partir de ce que l'utilisateur a décrit. `platform` et `screen`
 * n'arrivent qu'à l'acceptation, via `bugReportContext` — c'est alors ce
 * triplet complet qui devient la charge utile stockée, dans la forme
 * qu'attend `createFeedbackSchema` une fois `category: "bug"` ajoutée.
 */
export const reportBugPayloadSchema = z.object({
  content: z.string().trim().min(1).max(FEEDBACK_CONTENT_MAX_LENGTH),
});

export type ReportBugPayload = z.infer<typeof reportBugPayloadSchema>;
