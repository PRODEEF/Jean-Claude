import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "../shared/primitives";

/** Longueur d'un souvenir : une phrase, pas un paragraphe. */
export const MEMORY_MAX_LENGTH = 300;

/** Au-delà, l'utilisateur ne s'y retrouve plus et la consigne du modèle gonfle. */
export const MEMORY_MAX_PER_USER = 100;

export const memoryContentSchema = z.string().trim().min(1).max(MEMORY_MAX_LENGTH);

/**
 * Ce que Jean-Claude retient de l'utilisateur : un goût, une habitude, une
 * contrainte (« préfère courir le matin », « déteste les réunions le lundi »).
 *
 * `source` dit qui l'a posé : l'assistant, après que l'utilisateur a accepté sa
 * proposition (§12.1), ou l'utilisateur lui-même depuis l'écran « Ce que
 * Jean-Claude sait de moi ».
 */
export const memorySchema = z.object({
  id: uuidSchema,
  content: memoryContentSchema,
  source: z.enum(["assistant", "user"]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type Memory = z.infer<typeof memorySchema>;

export const createMemorySchema = z.object({ content: memoryContentSchema });
export type CreateMemory = z.infer<typeof createMemorySchema>;

export const updateMemorySchema = z.object({ content: memoryContentSchema });
export type UpdateMemory = z.infer<typeof updateMemorySchema>;
