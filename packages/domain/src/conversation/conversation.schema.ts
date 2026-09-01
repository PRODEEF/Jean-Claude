import { z } from "zod";
import { isoDateTimeSchema, labelSchema, uuidSchema } from "../shared/primitives";

/**
 * Registre d'une conversation (A.10).
 *
 * - `chat`      : IA conversationnelle classique, rangée dans un ou plusieurs dossiers.
 * - `assistant` : canal permanent Jean-Claude, borné aux rappels, à l'organisation
 *                 interne de l'outil et à la structure du projet. Unique par utilisateur.
 *
 * Dès qu'un échange du canal permanent sort de ce périmètre, l'API crée une
 * conversation `chat` distincte plutôt que de poursuivre dans le canal.
 */
/**
 * Titre d'une conversation qui n'a pas encore été nommée.
 *
 * Doit rester aligné sur le `default` de la colonne `conversations.title` :
 * c'est à cette valeur que le serveur reconnaît un fil encore à nommer.
 */
export const DEFAULT_CONVERSATION_TITLE = "Nouvelle conversation";

export const conversationKindSchema = z.enum(["chat", "assistant"]);
export type ConversationKind = z.infer<typeof conversationKindSchema>;

export const conversationSchema = z.object({
  id: uuidSchema,
  kind: conversationKindSchema,
  /** Généré par l'assistant à partir des premiers messages, éditable par l'utilisateur. */
  title: labelSchema,
  /**
   * Rangement matriciel (§5.2, A.1) : une conversation est rattachée à N dossiers,
   * jamais dupliquée. Tableau vide = conversation non classée.
   */
  folderIds: z.array(uuidSchema),
  archivedAt: isoDateTimeSchema.nullable(),
  lastMessageAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type Conversation = z.infer<typeof conversationSchema>;

export const createConversationSchema = z.object({
  title: labelSchema.optional(),
  folderIds: z.array(uuidSchema).default([]),
});

export type CreateConversation = z.infer<typeof createConversationSchema>;

export const updateConversationSchema = z.object({
  title: labelSchema.optional(),
  archived: z.boolean().optional(),
});

export type UpdateConversation = z.infer<typeof updateConversationSchema>;

/**
 * Qui a décidé du rattachement d'une conversation à un dossier (A.1).
 * Distinguer les deux permet à l'assistant d'apprendre la logique de rangement
 * de l'utilisateur (A.7) : un rattachement corrigé manuellement est un signal fort.
 */
export const folderAssignmentSourceSchema = z.enum(["user", "assistant"]);
export type FolderAssignmentSource = z.infer<typeof folderAssignmentSourceSchema>;

export const assignFoldersSchema = z.object({
  folderIds: z.array(uuidSchema),
  source: folderAssignmentSourceSchema.default("user"),
});

export type AssignFolders = z.infer<typeof assignFoldersSchema>;
