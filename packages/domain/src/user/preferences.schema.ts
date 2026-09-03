import { z } from "zod";
import { hexColorSchema, isoDateTimeSchema, uuidSchema } from "../shared/primitives";
import { assistantScopeSchema } from "../assistant/assistant.schema";

/** Thème de l'interface — `system` suit le réglage de l'OS. */
export const themeSchema = z.enum(["light", "dark", "system"]);
export type Theme = z.infer<typeof themeSchema>;

/** Nom de l'assistant tant que l'utilisateur n'en a pas choisi un autre. */
export const DEFAULT_ASSISTANT_NAME = "Jean-Claude";

/**
 * Éditeurs hébergeant et opérant en France/UE (§5.1, §13.4.6).
 *
 * Défini ici et non dans l'API : la mention « hébergé en Europe » s'affiche
 * dans les réglages **et** se calcule côté serveur pour `/api/health`. Deux
 * listes divergeraient — l'utilisateur lirait une promesse que le serveur ne
 * tient pas.
 *
 * La souveraineté se lit sur l'éditeur du modèle, jamais sur le routeur qui
 * l'appelle : c'est bien Mistral ou Anthropic qui traite le contenu des
 * conversations.
 */
const SOVEREIGN_CREATORS: readonly string[] = ["mistral"];

/** Vrai si l'éditeur du modèle héberge et opère en France/UE. */
export function isSovereignModel(model: string): boolean {
  return SOVEREIGN_CREATORS.includes(model.split("/")[0] ?? "");
}

/**
 * Modèles proposés à l'utilisateur dans ses réglages (§5.1).
 *
 * Liste fermée, et non un champ libre : l'identifiant `éditeur/modèle` du
 * Gateway est du jargon, et le §13.4.4 tient le produit hors du vocabulaire
 * technique. Ajouter un modèle se fait ici, en deux endroits que le
 * compilateur garde synchronisés.
 */
const ASSISTANT_MODEL_IDS = [
  "anthropic/claude-sonnet-5",
  "mistral/mistral-large",
  "deepseek/deepseek-chat",
] as const;

export const assistantModelSchema = z.enum(ASSISTANT_MODEL_IDS);
export type AssistantModel = z.infer<typeof assistantModelSchema>;

/**
 * Ce que les réglages affichent de chaque modèle.
 *
 * `benefit` s'adresse à quelqu'un qui ne connaît rien aux modèles de langage :
 * il dit à quoi sert ce choix, pas comment le modèle est construit. Ni taille,
 * ni éditeur, ni performance chiffrée — rien qu'on ne saurait vérifier soi-même
 * en s'en servant.
 *
 * Un `Record` et non un tableau : le compilateur refuse alors qu'un modèle
 * entre dans la liste sans qu'on ait écrit ce qu'il apporte.
 */
const ASSISTANT_MODEL_DETAILS: Record<AssistantModel, { label: string; benefit: string }> = {
  "anthropic/claude-sonnet-5": {
    label: "Claude",
    benefit: "Le plus à l'aise sur les échanges longs et les demandes détaillées.",
  },
  "mistral/mistral-large": {
    label: "Mistral",
    benefit: "Vos conversations restent hébergées en Europe. Rapide au quotidien.",
  },
  "deepseek/deepseek-chat": {
    label: "DeepSeek",
    benefit: "Le plus économique, pour un usage courant sans exigence particulière.",
  },
};

export type AssistantModelChoice = {
  id: AssistantModel;
  label: string;
  benefit: string;
  /** Hébergement et opérateur en France/UE — affiché tel quel (§13.4.6). */
  sovereign: boolean;
};

/**
 * Catalogue ordonné, tel que les réglages le présentent.
 *
 * L'ordre est celui de `ASSISTANT_MODEL_IDS` : un `Record` n'en porte aucun,
 * et l'ordre d'affichage est une décision de conception, pas un hasard
 * d'itération.
 */
export const ASSISTANT_MODELS: readonly AssistantModelChoice[] = ASSISTANT_MODEL_IDS.map((id) => ({
  id,
  ...ASSISTANT_MODEL_DETAILS[id],
  sovereign: isSovereignModel(id),
}));

/**
 * Modèle enregistré, ou `null` si la valeur ne désigne plus rien de proposé.
 *
 * Retirer un modèle du catalogue ne doit pas rendre illisible le profil de
 * ceux qui l'avaient choisi : ils retombent sur le modèle du serveur, sans
 * rien à réparer en base.
 */
export function toAssistantModel(value: unknown): AssistantModel | null {
  const parsed = assistantModelSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Préférences du panneau de paramètres de la maquette : nom et couleur de
 * l'assistant, thème, périmètre du mode assistant.
 */
export const userPreferencesSchema = z.object({
  /** L'assistant est renommable — « Jean-Claude » n'est que la valeur par défaut. */
  assistantName: z.string().trim().min(1).max(40).default(DEFAULT_ASSISTANT_NAME),
  assistantColor: hexColorSchema.default("#6366F1"),
  theme: themeSchema.default("system"),
  scope: assistantScopeSchema,
  /** Fuseau IANA — indispensable au calcul des rappels du matin (A.10). */
  timezone: z.string().default("Europe/Paris"),
  /** Lecture à voix haute des réponses par défaut (§12.3). */
  speakResponses: z.boolean().default(false),
  /**
   * Modèle choisi par l'utilisateur (§5.1). `null` — le cas au premier
   * démarrage — laisse répondre celui que le serveur a retenu, ce qui permet
   * d'en changer par configuration sans réécrire les profils existants.
   */
  llmModel: assistantModelSchema.nullable().default(null),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

/**
 * Contexte stable retenu sur l'utilisateur (§13.4.2).
 *
 * Sert à valider ce que l'assistant produit au terme de l'accueil (§6.3) ;
 * `userProfileSchema` reste plus permissif en lecture, pour qu'une mémoire
 * écrite par une version antérieure ne rende pas le profil illisible.
 */
export const userMemorySchema = z.string().trim().min(1).max(8_000);

export const userProfileSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  displayName: z.string().trim().max(80).nullable(),
  /**
   * Contexte stable appris pendant l'onboarding conversationnel (§6.3, A.13)
   * puis enrichi au fil des échanges. Distinct du contexte ponctuel, qui vit
   * dans les conversations — cf. §13.4.2.
   */
  memory: z.string().max(8_000).nullable(),
  onboardingCompletedAt: isoDateTimeSchema.nullable(),
  preferences: userPreferencesSchema,
  createdAt: isoDateTimeSchema,
});

export type UserProfile = z.infer<typeof userProfileSchema>;

/**
 * Ce que la page de réglages sait modifier aujourd'hui.
 *
 * Volontairement plus étroit que `userPreferencesSchema` : accepter des champs
 * que le serveur ignorerait ferait croire au client qu'ils ont été enregistrés.
 * `timezone` et `speakResponses` en restent dehors tant qu'aucun écran ne les
 * pilote.
 *
 * `memory` et `onboardingCompletedAt` n'y entreront jamais : ils sont écrits
 * par le serveur au terme de la conversation d'accueil (§6.3), pas saisis.
 */
export const updateUserProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    theme: themeSchema,
    assistantName: userPreferencesSchema.shape.assistantName,
    assistantColor: hexColorSchema,
    /**
     * Périmètre partiel : la page bascule un interrupteur à la fois, et les
     * capacités absentes du patch gardent la valeur enregistrée (A.10).
     */
    scope: assistantScopeSchema.partial(),
    /** `null` rend la main au modèle retenu par le serveur (§5.1). */
    llmModel: assistantModelSchema.nullable(),
  })
  .partial();

export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
