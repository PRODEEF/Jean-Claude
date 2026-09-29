import type { CreateGroup, Group, GroupMessage, Paginated } from "@jc/domain";

/** Un membre de l'espace, tel que Jean-Claude le nomme dans le fil. */
export type WorkspaceMemberName = { userId: string; displayName: string | null };

/** Réponse de Jean-Claude à inscrire dans le fil, avec le moteur qui l'a produite. */
export type AssistantReply = { content: string; provider: string; model: string };

export interface IGroupRepository {
  /** Membres de l'espace ; vide si l'appelant n'en fait pas partie. */
  findWorkspaceMembers(workspaceId: string, accessToken: string): Promise<WorkspaceMemberName[]>;
  /** Les groupes de l'espace dont `userId` est membre, du plus récemment actif au plus ancien. */
  findByWorkspace(workspaceId: string, userId: string, accessToken: string): Promise<Group[]>;
  /** `null` si le groupe n'existe pas ou si `userId` n'en est pas membre. */
  findById(id: string, userId: string, accessToken: string): Promise<Group | null>;
  /** Crée le groupe avec `userId` et `input.memberIds` pour membres. */
  create(userId: string, input: CreateGroup, accessToken: string): Promise<Group>;
  setAiMuted(groupId: string, aiMuted: boolean, accessToken: string): Promise<void>;
  /** Du plus ancien au plus récent ; `nextCursor` remonte vers les plus anciens. */
  findMessages(
    groupId: string,
    options: { cursor?: string; limit: number },
    accessToken: string,
  ): Promise<Paginated<GroupMessage>>;
  /** Identifiant du dernier message du fil, `null` pour un fil vide. */
  findLatestMessageId(groupId: string, accessToken: string): Promise<string | null>;
  appendMessage(
    groupId: string,
    userId: string,
    content: string,
    accessToken: string,
  ): Promise<GroupMessage>;
  /**
   * `userId` est le membre dont le message a déclenché la réponse : la RLS
   * n'accepte un message que signé de l'appelant, et c'est lui qui en porte
   * le coût (`llm_rate_limits`).
   */
  appendAssistantMessage(
    groupId: string,
    userId: string,
    reply: AssistantReply,
    accessToken: string,
  ): Promise<GroupMessage>;
  /** Modèle choisi par `userId` dans ses réglages (§5.1), `null` s'il n'en a pas choisi. */
  findAssistantModel(userId: string, accessToken: string): Promise<string | null>;
  /** Remet à zéro les non-lus de `userId` dans ce groupe. */
  markRead(groupId: string, userId: string, accessToken: string): Promise<void>;
}
