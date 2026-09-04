import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "../shared/primitives";

export const feedbackCategorySchema = z.enum(["bug", "idea", "other"]);
export type FeedbackCategory = z.infer<typeof feedbackCategorySchema>;

export const feedbackPlatformSchema = z.enum(["web", "ios", "android"]);
export type FeedbackPlatform = z.infer<typeof feedbackPlatformSchema>;

/** Borne du texte libre — avis général comme commentaire de notation. */
export const FEEDBACK_CONTENT_MAX_LENGTH = 2000;

export const feedbackSchema = z.object({
  id: uuidSchema,
  category: feedbackCategorySchema,
  content: z.string(),
  platform: feedbackPlatformSchema,
  /** Écran d'où l'avis a été envoyé — contexte technique joint automatiquement. */
  screen: z.string(),
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
