import { z } from "zod";
import { folderPurposeSchema } from "../folder/folder.schema";
import { isoDateTimeSchema, labelSchema, uuidSchema } from "../shared/primitives";

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

export const resolveSuggestionSchema = z.object({
  action: z.enum(["accept", "dismiss"]),
});

export type ResolveSuggestion = z.infer<typeof resolveSuggestionSchema>;

/** Dossier proposé par l'assistant, tel qu'il apparaît dans la carte de suggestion. */
const proposedFolderSchema = z.object({
  name: labelSchema,
  purpose: folderPurposeSchema.default("generic"),
});

/**
 * Charge utile d'une suggestion `create_project_folders` (A.4).
 *
 * Deux niveaux et pas trois : un sous-dossier ne porte pas d'enfants, la
 * profondeur étant bornée en V1 (§3 Phase A). La forme l'interdit donc avant
 * même que le trigger Postgres n'ait à le faire.
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
 * Verdict de bornage du canal permanent (A.10).
 *
 * Quand un message adressé au canal permanent sort du périmètre assistant,
 * on ne répond pas dans le canal : on bascule l'échange vers une nouvelle
 * conversation classique, rangée en dossier.
 */
export type ScopeVerdict =
  | { inScope: true }
  | { inScope: false; reason: string; suggestedTitle: string };
