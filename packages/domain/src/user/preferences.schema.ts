import { z } from "zod";
import { hexColorSchema, isoDateTimeSchema, uuidSchema } from "../shared/primitives";
import { assistantScopeSchema } from "../assistant/assistant.schema";

/** Thème de l'interface — `system` suit le réglage de l'OS. */
export const themeSchema = z.enum(["light", "dark", "system"]);
export type Theme = z.infer<typeof themeSchema>;

/**
 * Préférences du panneau de paramètres de la maquette : nom et couleur de
 * l'assistant, thème, périmètre du mode assistant.
 */
export const userPreferencesSchema = z.object({
  /** L'assistant est renommable — « Jean-Claude » n'est que la valeur par défaut. */
  assistantName: z.string().trim().min(1).max(40).default("Jean-Claude"),
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
