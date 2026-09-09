import { z } from "zod";
import { isoDateTimeSchema, labelSchema, uuidSchema } from "../shared/primitives";

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

/** Type MIME accepté pour une pièce jointe (§13.4.1) — images et PDF. */
export const messageAttachmentMimeTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
export type MessageAttachmentMimeType = z.infer<typeof messageAttachmentMimeTypeSchema>;

/**
 * Pièce jointe telle que le client la reçoit.
 *
 * `url` est une URL signée à courte durée de vie, jamais le chemin de
 * stockage brut — le bucket est privé, un fichier pouvant porter une donnée
 * sensible (§8, §13.4.6).
 */
export const messageAttachmentSchema = z.object({
  id: uuidSchema,
  url: z.string().url(),
  fileName: z.string(),
  mimeType: messageAttachmentMimeTypeSchema,
  byteSize: z.number().int().positive(),
  /**
   * Texte extrait côté serveur pour un PDF — jamais pour une image, qui parle
   * directement au modèle par la vision. `null` pour une image ; jamais vide
   * pour un PDF accepté, un PDF sans texte exploitable étant refusé à l'upload.
   */
  extractedText: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});

export type MessageAttachment = z.infer<typeof messageAttachmentSchema>;

export const messageSchema = z.object({
  id: uuidSchema,
  conversationId: uuidSchema,
  role: messageRoleSchema,
  content: z.string(),
  inputMode: messageInputModeSchema,
  /**
   * Images et PDF joints. Une image parle au modèle par la vision ; un PDF
   * lui parle par son texte, extrait une fois pour toutes à l'upload.
   * Toujours un tableau : une jointure vide donne `[]`, jamais `null`.
   */
  attachments: z.array(messageAttachmentSchema),
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
  /**
   * Titre de la conversation dédiée que ce message propose d'ouvrir (A.10).
   *
   * `null` partout ailleurs. Porté par le message et non par une suggestion :
   * la bascule n'écrit rien dans les données de l'utilisateur, elle choisit
   * seulement où la réponse sera donnée, et la proposition doit rester lisible
   * à sa place dans le fil après un rechargement.
   */
  redirectTitle: labelSchema.nullable(),
  /**
   * Instant où l'utilisateur a validé la bascule. Tant qu'il est `null`, la
   * carte de validation attend son geste ; une fois posé, l'échange sort du
   * contexte remis au modèle — la réponse se donne dans l'autre fil.
   */
  redirectAcceptedAt: isoDateTimeSchema.nullable(),
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

/** Nombre maximum de pièces jointes par message (décision produit). */
export const MESSAGE_ATTACHMENT_MAX_COUNT = 4;

/**
 * Taille maximale d'une pièce jointe, en octets — 10 Mo (décision produit).
 * Même borne pour une image et un PDF : un PDF texte la dépasse rarement, à
 * revoir séparément si l'usage montre le seuil trop bas pour ce second cas.
 */
export const MESSAGE_ATTACHMENT_MAX_BYTES = 10_485_760;

/**
 * Un message composé uniquement d'une pièce jointe, sans texte, est valide —
 * comme chez Claude. Le `refine` remplace le `min(1)` sur `content` par une
 * règle portant sur l'ensemble : texte ou pièce jointe, l'un des deux au moins.
 */
export const sendMessageSchema = z
  .object({
    content: z.string().trim().max(MESSAGE_MAX_LENGTH),
    inputMode: messageInputModeSchema.default("text"),
    attachmentIds: z.array(uuidSchema).max(MESSAGE_ATTACHMENT_MAX_COUNT).default([]),
  })
  .refine((value) => value.content.length > 0 || value.attachmentIds.length > 0, {
    message: "Écrivez un message ou joignez une pièce jointe.",
    path: ["content"],
  });

export type SendMessage = z.infer<typeof sendMessageSchema>;

/**
 * Correction d'un message déjà envoyé.
 *
 * Même borne que l'envoi : c'est le même texte, relu. Le mode d'entrée n'y
 * figure pas — corriger à l'écrit un message dicté ne change pas d'où il
 * venait (§12.3, A.12).
 */
export const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
});

export type EditMessage = z.infer<typeof editMessageSchema>;

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
  /**
   * La réponse complète, persistée. Clôt le flux.
   *
   * C'est aussi par elle qu'arrive une proposition de bascule (A.10) : le
   * message porte `redirectTitle`, l'application demande la validation.
   */
  z.object({ type: z.literal("done"), message: messageSchema }),
  /** Échec après le premier octet. Clôt le flux. */
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type MessageStreamEvent = z.infer<typeof messageStreamEventSchema>;
