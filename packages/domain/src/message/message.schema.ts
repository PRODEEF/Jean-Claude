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

/**
 * Événements d'un tour de dialogue en flux.
 *
 * L'envoi d'un message ne renvoie pas une réponse mais une suite d'événements,
 * pour que le texte s'affiche au fil de sa génération plutôt qu'après plusieurs
 * secondes d'écran figé — comportement des trois apps de référence du §4.2.
 *
 * `error` voyage **dans** le flux et non en code HTTP : quand la génération
 * échoue en cours de route, les en-têtes de la réponse sont déjà partis.
 */
export const messageStreamEventSchema = z.discriminatedUnion("type", [
  /** Le message de l'utilisateur, tel que persisté — émis avant toute génération. */
  z.object({ type: z.literal("message"), message: messageSchema }),
  /** Un fragment de la réponse en cours. */
  z.object({ type: z.literal("text"), text: z.string() }),
  /** La réponse complète, persistée. Clôt le flux. */
  z.object({ type: z.literal("done"), message: messageSchema }),
  /** Échec après le premier octet. Clôt le flux. */
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type MessageStreamEvent = z.infer<typeof messageStreamEventSchema>;
