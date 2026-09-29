import { z } from "zod";
import { MESSAGE_MAX_LENGTH } from "../message/message.schema";
import { isoDateTimeSchema, labelSchema, uuidSchema } from "../shared/primitives";

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

export const groupMessageRoleSchema = z.enum(["user", "assistant"]);
export type GroupMessageRole = z.infer<typeof groupMessageRoleSchema>;

export const groupMessageSchema = z.object({
  id: uuidSchema,
  groupId: uuidSchema,
  /**
   * Auteur d'un message `user`. Pour un message `assistant`, le membre dont le
   * message a déclenché l'intervention de Jean-Claude.
   */
  authorId: uuidSchema,
  role: groupMessageRoleSchema,
  content: z.string(),
  createdAt: isoDateTimeSchema,
});
export type GroupMessage = z.infer<typeof groupMessageSchema>;

export const sendGroupMessageSchema = z.object({
  content: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
});
export type SendGroupMessage = z.infer<typeof sendGroupMessageSchema>;

/** Rangement complet : la liste remplace celle d'avant. */
export const assignGroupFoldersSchema = z.object({ folderIds: z.array(uuidSchema).max(50) });
export type AssignGroupFolders = z.infer<typeof assignGroupFoldersSchema>;

export const listGroupsQuerySchema = z.object({ workspaceId: uuidSchema });
export type ListGroupsQuery = z.infer<typeof listGroupsQuerySchema>;

export const updateGroupSchema = z.object({ aiMuted: z.boolean() });
export type UpdateGroup = z.infer<typeof updateGroupSchema>;

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

/** Canal Realtime d'un groupe — même forme côté app et dans la policy SQL. */
export function groupRealtimeTopic(groupId: string): string {
  return `group:${groupId}`;
}
