import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "../shared/primitives";

export const messageRoleSchema = z.enum(["user", "assistant", "system"]);
export type MessageRole = z.infer<typeof messageRoleSchema>;

/**
 * Canal d'entrée du message (§12.3, A.12).
 *
 * Le vocal n'est pas un mode séparé : un message dicté alimente la même
 * conversation qu'un message tapé. On conserve l'origine uniquement pour
 * l'analyse d'usage et pour décider si la réponse doit être lue à voix haute.
 */
export const messageInputModeSchema = z.enum(["text", "voice"]);
export type MessageInputMode = z.infer<typeof messageInputModeSchema>;

export const messageSchema = z.object({
  id: uuidSchema,
  conversationId: uuidSchema,
  role: messageRoleSchema,
  content: z.string(),
  inputMode: messageInputModeSchema,
  /**
   * Traçabilité du moteur IA (§5.1). Conservée par message et non par conversation :
   * l'ajout d'un second fournisseur permettra de changer de modèle en cours de fil.
   */
  provider: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});

export type Message = z.infer<typeof messageSchema>;

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(32_000),
  inputMode: messageInputModeSchema.default("text"),
});

export type SendMessage = z.infer<typeof sendMessageSchema>;
