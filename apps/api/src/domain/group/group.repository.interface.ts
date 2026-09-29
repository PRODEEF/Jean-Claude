import type { CreateGroup, Group, GroupMessage, Paginated } from "@jc/domain";

export interface IGroupRepository {
  /** Membres de l'espace ; vide si l'appelant n'en fait pas partie. */
  findWorkspaceMemberIds(workspaceId: string, accessToken: string): Promise<string[]>;
  /** Les groupes de l'espace dont `userId` est membre, du plus récemment actif au plus ancien. */
  findByWorkspace(workspaceId: string, userId: string, accessToken: string): Promise<Group[]>;
  /** `null` si le groupe n'existe pas ou si `userId` n'en est pas membre. */
  findById(id: string, userId: string, accessToken: string): Promise<Group | null>;
  /** Crée le groupe avec `userId` et `input.memberIds` pour membres. */
  create(userId: string, input: CreateGroup, accessToken: string): Promise<Group>;
  /** Du plus ancien au plus récent ; `nextCursor` remonte vers les plus anciens. */
  findMessages(
    groupId: string,
    options: { cursor?: string; limit: number },
    accessToken: string,
  ): Promise<Paginated<GroupMessage>>;
  appendMessage(
    groupId: string,
    userId: string,
    content: string,
    accessToken: string,
  ): Promise<GroupMessage>;
  /** Remet à zéro les non-lus de `userId` dans ce groupe. */
  markRead(groupId: string, userId: string, accessToken: string): Promise<void>;
}
