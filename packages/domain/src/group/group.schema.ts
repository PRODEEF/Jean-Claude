import { z } from "zod";
import {
  MESSAGE_ATTACHMENT_MAX_COUNT,
  MESSAGE_MAX_LENGTH,
  messageAttachmentMimeTypeSchema,
  messageAttachmentSchema,
} from "../message/message.schema";
import {
  cursorPaginationSchema,
  isoDateTimeSchema,
  labelSchema,
  uuidSchema,
} from "../shared/primitives";

/**
 * Discussions de groupe d'un espace d'équipe — voir docs/COLLABORATION.md.
 *
 * En base, un groupe est une conversation `kind = 'group'`. Il a ses propres
 * types et ses propres routes : le tour d'une conversation personnelle remet
 * au modèle le contexte privé de son auteur, ce qu'un groupe ne doit jamais
 * voir.
 */

export const groupSchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  title: z.string(),
  /** Membres du groupe, appelant compris. */
  memberIds: z.array(uuidSchema),
  /** Dossiers de l'espace où la conversation est rangée — plusieurs possibles (A.1). */
  folderIds: z.array(uuidSchema),
  /** Bouton silence : Jean-Claude ne parle que si on le mentionne (lot 4). */
  aiMuted: z.boolean(),
  /** Messages des autres reçus depuis la dernière lecture — propres à l'appelant. */
  unreadCount: z.number().int().min(0),
  lastMessageAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type Group = z.infer<typeof groupSchema>;

export const createGroupSchema = z.object({
  workspaceId: uuidSchema,
  title: labelSchema,
  /** Les autres membres ; le créateur est ajouté d'office. */
  memberIds: z.array(uuidSchema).min(1, "Choisissez au moins une personne.").max(100),
});
export type CreateGroup = z.infer<typeof createGroupSchema>;

/**
 * `system` : ligne du fil sans bulle, signée du membre dont le geste la produit
 * — une annonce de l'application (`announcement`) ou une ligne du calendrier
 * (lot 8). Le modèle lit les lignes du calendrier, pas les annonces.
 */
export const groupMessageRoleSchema = z.enum(["user", "assistant", "system"]);
export type GroupMessageRole = z.infer<typeof groupMessageRoleSchema>;

/** Message cité par une réponse, tel que la bulle le rappelle. */
export const quotedGroupMessageSchema = z.object({
  id: uuidSchema,
  authorId: uuidSchema,
  role: groupMessageRoleSchema,
  content: z.string(),
});
export type QuotedGroupMessage = z.infer<typeof quotedGroupMessageSchema>;

export const groupMessageSchema = z.object({
  id: uuidSchema,
  groupId: uuidSchema,
  /**
   * Auteur d'un message `user`. Pour un message `assistant`, le membre dont le
   * message a déclenché l'intervention de Jean-Claude. Pour un message
   * `system`, le membre dont le geste l'a produit.
   */
  authorId: uuidSchema,
  role: groupMessageRoleSchema,
  content: z.string(),
  /**
   * Annonce du fil (`system` posé par l'application), à distinguer d'une ligne
   * du calendrier, qui l'est aussi. Le modèle lit la seconde, pas la première.
   */
  announcement: z.boolean(),
  /**
   * Message auquel celui-ci répond (lot 6). Rendu avec la réponse : il peut
   * être hors de la page chargée. `null` aussi quand il a été supprimé.
   */
  replyTo: quotedGroupMessageSchema.nullable(),
  /** Fichiers joints, lisibles des membres de la conversation (lot 7). */
  attachments: z.array(messageAttachmentSchema),
  /** Fichiers joints puis supprimés : le message dit qu'il y en avait un. */
  removedAttachments: z.array(z.object({ id: uuidSchema, fileName: z.string() })),
  createdAt: isoDateTimeSchema,
});
export type GroupMessage = z.infer<typeof groupMessageSchema>;

/** Texte ou fichier, l'un des deux au moins — comme dans le fil personnel. */
export const sendGroupMessageSchema = z
  .object({
    content: z.string().trim().max(MESSAGE_MAX_LENGTH),
    /** Message du même fil auquel on répond. */
    replyToId: uuidSchema.optional(),
    /** Pièces déjà déposées dans l'espace (`POST /attachments` avec `workspaceId`). */
    attachmentIds: z.array(uuidSchema).max(MESSAGE_ATTACHMENT_MAX_COUNT).default([]),
  })
  .refine((value) => value.content.length > 0 || value.attachmentIds.length > 0, {
    message: "Écrivez un message ou joignez un fichier.",
    path: ["content"],
  });
export type SendGroupMessage = z.infer<typeof sendGroupMessageSchema>;

/**
 * Un fichier de la page « Fichiers » d'un espace : envoyé dans une
 * conversation dont l'appelant est membre, et pas supprimé.
 */
export const workspaceFileSchema = z.object({
  id: uuidSchema,
  /** URL signée à courte durée de vie : le bucket est privé. */
  url: z.string().url(),
  fileName: z.string(),
  mimeType: messageAttachmentMimeTypeSchema,
  byteSize: z.number().int().positive(),
  authorId: uuidSchema,
  groupId: uuidSchema,
  groupTitle: z.string(),
  /** L'auteur ou un admin de l'espace — décidé par le serveur. */
  canDelete: z.boolean(),
  createdAt: isoDateTimeSchema,
});
export type WorkspaceFile = z.infer<typeof workspaceFileSchema>;

export const listWorkspaceFilesQuerySchema = cursorPaginationSchema.extend({
  workspaceId: uuidSchema,
  /** Seulement les fichiers des conversations rangées dans ce dossier. */
  folderId: uuidSchema.optional(),
});
export type ListWorkspaceFilesQuery = z.infer<typeof listWorkspaceFilesQuerySchema>;

/** Rangement complet : la liste remplace celle d'avant. */
export const assignGroupFoldersSchema = z.object({ folderIds: z.array(uuidSchema).max(50) });
export type AssignGroupFolders = z.infer<typeof assignGroupFoldersSchema>;

export const listGroupsQuerySchema = z.object({ workspaceId: uuidSchema });
export type ListGroupsQuery = z.infer<typeof listGroupsQuerySchema>;

export const updateGroupSchema = z.object({ aiMuted: z.boolean() });
export type UpdateGroup = z.infer<typeof updateGroupSchema>;

export const groupListSuggestionStatusSchema = z.enum(["pending", "accepted", "dismissed"]);
export type GroupListSuggestionStatus = z.infer<typeof groupListSuggestionStatusSchema>;

/**
 * Liste partagée proposée par Jean-Claude dans une conversation d'espace
 * (§12.1) : tout membre de la conversation l'accepte — elle devient une liste
 * de l'espace — ou l'ignore.
 */
export const groupListSuggestionSchema = z.object({
  id: uuidSchema,
  groupId: uuidSchema,
  /** Le message de Jean-Claude sous lequel la carte s'affiche. */
  messageId: uuidSchema,
  title: z.string(),
  tasks: z.array(z.object({ title: z.string(), assigneeId: uuidSchema.nullable() })),
  status: groupListSuggestionStatusSchema,
  /** La liste créée, une fois la proposition acceptée. */
  listId: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type GroupListSuggestion = z.infer<typeof groupListSuggestionSchema>;

/**
 * Le message appelle-t-il Jean-Claude ?
 *
 * `@Jean-Claude`, quelle que soit la casse, avec ou sans accent ni trait
 * d'union : au clavier d'un téléphone, `@jean claude` ou `@Jéan-Claude`
 * arrivent aussi souvent que la forme exacte. Une mention au milieu d'un mot
 * (`mail@jean-claude.fr`) ne compte pas.
 */
export function mentionsAssistant(content: string): boolean {
  const plain = content
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return /(^|[^\p{L}\p{N}_.])@jean[\s-]?claude(?![\p{L}\p{N}])/u.test(plain);
}

/**
 * Texte du message une fois la mention en cours de saisie complétée, ou `null`
 * s'il n'y a rien à proposer.
 *
 * Ne regarde que la fin du texte : c'est là qu'on tape. Même tolérance que
 * `mentionsAssistant` sur la casse et les accents — `@jea` propose
 * `@Jean-Claude`. Rien n'est proposé une fois le nom entier saisi, ni pour une
 * arobase au milieu d'un mot (`mail@…`).
 */
export function completeAssistantMention(draft: string, assistantName: string): string | null {
  const match = /(^|\s)@([^\s@]*)$/u.exec(draft);
  if (!match) return null;

  const fold = (text: string) =>
    text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const typed = match[2] ?? "";
  const target = fold(assistantName);
  const partial = fold(typed);
  if (partial === target || !target.startsWith(partial)) return null;

  return `${draft.slice(0, draft.length - typed.length - 1)}@${assistantName} `;
}

/** Canal Realtime d'un groupe — même forme côté app et dans la policy SQL. */
export function groupRealtimeTopic(groupId: string): string {
  return `group:${groupId}`;
}
