import { z } from "zod";
import { hexColorSchema, isoDateTimeSchema, uuidSchema } from "../shared/primitives";
import { assistantScopeSchema } from "../assistant/assistant.schema";

/** Thème de l'interface — `system` suit le réglage de l'OS. */
export const themeSchema = z.enum(["light", "dark", "system"]);
export type Theme = z.infer<typeof themeSchema>;

/** Nom de l'assistant tant que l'utilisateur n'en a pas choisi un autre. */
export const DEFAULT_ASSISTANT_NAME = "Jean-Claude";

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
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export const updateUserPreferencesSchema = userPreferencesSchema.partial().extend({
  scope: assistantScopeSchema.partial().optional(),
});

export type UpdateUserPreferences = z.infer<typeof updateUserPreferencesSchema>;

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
 * Volontairement plus étroit que `updateUserPreferencesSchema` : accepter des
 * champs que le serveur ignorerait ferait croire au client qu'ils ont été
 * enregistrés. `timezone` et `speakResponses` en restent dehors tant qu'aucun
 * écran ne les pilote.
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
  })
  .partial();

export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
