import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "../shared/primitives";

export const feedbackCategorySchema = z.enum(["bug", "idea", "other"]);
export type FeedbackCategory = z.infer<typeof feedbackCategorySchema>;

export const feedbackPlatformSchema = z.enum(["web", "ios", "android"]);
export type FeedbackPlatform = z.infer<typeof feedbackPlatformSchema>;

/**
 * Où en est un retour du point de vue de l'équipe. Posé par un admin à la
 * revue, jamais par le testeur : ce qu'il a écrit reste tel qu'il l'a envoyé.
 */
export const feedbackStatusSchema = z.enum(["new", "acknowledged", "resolved", "dismissed"]);
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;

/** Borne du texte libre — avis général comme commentaire de notation. */
export const FEEDBACK_CONTENT_MAX_LENGTH = 2000;

export const feedbackSchema = z.object({
  id: uuidSchema,
  category: feedbackCategorySchema,
  content: z.string(),
  platform: feedbackPlatformSchema,
  /** Écran d'où l'avis a été envoyé — contexte technique joint automatiquement. */
  screen: z.string(),
  status: feedbackStatusSchema,
  createdAt: isoDateTimeSchema,
});
export type Feedback = z.infer<typeof feedbackSchema>;

export const createFeedbackSchema = z.object({
  category: feedbackCategorySchema,
  content: z.string().trim().min(1).max(FEEDBACK_CONTENT_MAX_LENGTH),
  platform: feedbackPlatformSchema,
  screen: z.string().trim().min(1).max(120),
});
export type CreateFeedback = z.infer<typeof createFeedbackSchema>;

export const messageRatingValueSchema = z.enum(["up", "down"]);
export type MessageRatingValue = z.infer<typeof messageRatingValueSchema>;

export const messageRatingSchema = z.object({
  id: uuidSchema,
  messageId: uuidSchema,
  rating: messageRatingValueSchema,
  /** Renseigné surtout côté pouce bas — jamais imposé côté pouce haut. */
  comment: z.string().nullable(),
  platform: feedbackPlatformSchema,
  screen: z.string(),
  createdAt: isoDateTimeSchema,
});
export type MessageRating = z.infer<typeof messageRatingSchema>;

export const rateMessageSchema = z.object({
  rating: messageRatingValueSchema,
  comment: z.string().trim().min(1).max(FEEDBACK_CONTENT_MAX_LENGTH).nullable().optional(),
  platform: feedbackPlatformSchema,
  screen: z.string().trim().min(1).max(120),
});
export type RateMessage = z.infer<typeof rateMessageSchema>;

export const updateFeedbackStatusSchema = z.object({ status: feedbackStatusSchema });
export type UpdateFeedbackStatus = z.infer<typeof updateFeedbackStatusSchema>;

/**
 * Auteur d'un retour, tel que l'équipe le voit à la revue.
 *
 * Nom affiché et adresse, rien d'autre du profil : la mémoire et les réglages
 * du testeur ne servent pas à traiter ses retours (§8).
 */
export const feedbackAuthorSchema = z.object({
  id: uuidSchema,
  /** `null` tant que le testeur n'a pas choisi de pseudo. */
  displayName: z.string().nullable(),
  /** `null` si le compte a disparu entre l'envoi du retour et la revue. */
  email: z.string().nullable(),
});
export type FeedbackAuthor = z.infer<typeof feedbackAuthorSchema>;

/** Les retours d'un testeur, regroupés pour la revue — un testeur par entrée. */
export const testerFeedbackSchema = z.object({
  author: feedbackAuthorSchema,
  /** Du plus récent au plus ancien. */
  feedback: z.array(feedbackSchema),
  /** Pouces haut et bas sur les réponses de l'assistant, du plus récent au plus ancien. */
  ratings: z.array(messageRatingSchema),
  /** Date du retour ou de la notation la plus récente — ordonne les testeurs. */
  lastActivityAt: isoDateTimeSchema,
});
export type TesterFeedback = z.infer<typeof testerFeedbackSchema>;

/** Synthèse des retours d'un testeur, produite à la demande par le modèle. */
export const feedbackAnalysisSchema = z.object({
  summary: z.string(),
});
export type FeedbackAnalysis = z.infer<typeof feedbackAnalysisSchema>;
