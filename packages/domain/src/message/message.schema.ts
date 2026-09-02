import { z } from "zod";
import { conversationSchema } from "../conversation/conversation.schema";
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

/**
 * Réponse proposée sous une question de l'assistant.
 *
 * Brève par construction : c'est un bouton, pas une phrase. Au-delà, la carte
 * de question devient un pavé et l'utilisateur fait plus vite d'écrire.
 */
export const messageChoiceSchema = z.string().trim().min(1).max(80);

/**
 * Question à réponses proposées, telle que le modèle la renvoie.
 *
 * Décrite ici et non dans l'API : c'est la même forme que le client rendra,
 * et une seconde définition côté serveur aurait dérivé au premier changement
 * de bornes.
 */
export const askedQuestionSchema = z.object({
  question: z.string().trim().min(1).max(200),
  choices: z.array(messageChoiceSchema).min(2).max(6),
});

export type AskedQuestion = z.infer<typeof askedQuestionSchema>;

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
  /**
   * Réponses proposées quand le message est une question de l'assistant.
   *
   * `null` sur tout le reste : la carte de choix ne s'affiche que là où le
   * modèle a jugé que quelques réponses couvraient la question. Deux au moins,
   * six au plus — mêmes bornes que la contrainte SQL.
   */
  choices: z.array(messageChoiceSchema).min(2).max(6).nullable(),
  createdAt: isoDateTimeSchema,
});

export type Message = z.infer<typeof messageSchema>;

/**
 * Longueur maximale d'un message.
 *
 * Exportée parce que le champ de saisie doit la borner lui-même : sans elle,
 * un texte trop long part au serveur, revient en 400 générique, et le
 * brouillon est perdu en chemin.
 */
export const MESSAGE_MAX_LENGTH = 32_000;

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
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
  /**
   * Le canal permanent a jugé la demande hors de son périmètre (A.10) : la
   * conversation classique qui doit l'accueillir vient d'être créée, et c'est
   * là que l'échange se poursuit.
   */
  z.object({ type: z.literal("redirect"), conversation: conversationSchema }),
  /** Échec après le premier octet. Clôt le flux. */
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type MessageStreamEvent = z.infer<typeof messageStreamEventSchema>;
