import type {
  CreateGroup,
  Group,
  GroupEventSuggestion,
  GroupListSuggestion,
  GroupListSuggestionStatus,
  GroupMessage,
  Paginated,
} from "@jc/domain";

/** Un membre de l'espace, tel que Jean-Claude le nomme dans le fil. */
export type WorkspaceMemberName = { userId: string; displayName: string | null };

/** Liste proposée par Jean-Claude, déjà validée : titres bornés, responsables membres. */
export type ListProposal = {
  title: string;
  tasks: { title: string; assigneeId: string | null }[];
};

/** Événement proposé par Jean-Claude, déjà validé : instants canoniques, titre borné. */
export type EventProposal = {
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  notes: string | null;
};

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
  /** Identifiants des dossiers de l'espace ; vide pour qui n'en est pas membre. */
  findWorkspaceFolderIds(workspaceId: string, accessToken: string): Promise<string[]>;
  /** Aligne les rangements de la conversation sur `folderIds`. */
  setFolders(groupId: string, folderIds: string[], accessToken: string): Promise<void>;
  /** Du plus ancien au plus récent ; `nextCursor` remonte vers les plus anciens. */
  findMessages(
    groupId: string,
    options: { cursor?: string; limit: number },
    accessToken: string,
  ): Promise<Paginated<GroupMessage>>;
  /** Identifiant du dernier message du fil, `null` pour un fil vide. */
  findLatestMessageId(groupId: string, accessToken: string): Promise<string | null>;
  /** `null` si le message n'existe pas dans ce groupe. */
  findMessage(
    groupId: string,
    messageId: string,
    accessToken: string,
  ): Promise<GroupMessage | null>;
  /** `replyToId` : message du même fil auquel celui-ci répond (lot 6). */
  appendMessage(
    groupId: string,
    userId: string,
    content: string,
    replyToId: string | null,
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
  /** Inscrit une proposition de liste sous le message `messageId` de Jean-Claude. */
  createListSuggestion(
    groupId: string,
    messageId: string,
    userId: string,
    proposal: ListProposal,
    accessToken: string,
  ): Promise<GroupListSuggestion>;
  /** Propositions de la conversation, de la plus ancienne à la plus récente. */
  findListSuggestions(groupId: string, accessToken: string): Promise<GroupListSuggestion[]>;
  /**
   * Tranche une proposition encore en attente. `null` si elle ne l'est plus :
   * deux membres qui répondent en même temps, un seul l'emporte.
   */
  resolveListSuggestion(
    suggestionId: string,
    status: Exclude<GroupListSuggestionStatus, "pending">,
    userId: string,
    accessToken: string,
  ): Promise<GroupListSuggestion | null>;
  setSuggestionList(suggestionId: string, listId: string, accessToken: string): Promise<void>;
  /** Remet en attente une proposition dont l'acceptation a échoué en route. */
  reopenListSuggestion(suggestionId: string, accessToken: string): Promise<void>;
  /** Fuseau du profil de `userId`, où le modèle lit et écrit les dates. */
  findTimezone(userId: string, accessToken: string): Promise<string>;
  /** Inscrit une proposition d'événement sous le message `messageId` de Jean-Claude. */
  createEventSuggestion(
    groupId: string,
    messageId: string,
    userId: string,
    proposal: EventProposal,
    accessToken: string,
  ): Promise<GroupEventSuggestion>;
  findEventSuggestions(groupId: string, accessToken: string): Promise<GroupEventSuggestion[]>;
  /** Comme `resolveListSuggestion` : `null` si un autre membre a déjà tranché. */
  resolveEventSuggestion(
    suggestionId: string,
    status: Exclude<GroupListSuggestionStatus, "pending">,
    userId: string,
    accessToken: string,
  ): Promise<GroupEventSuggestion | null>;
  setSuggestionEvent(suggestionId: string, eventId: string, accessToken: string): Promise<void>;
  reopenEventSuggestion(suggestionId: string, accessToken: string): Promise<void>;
  /** Remet à zéro les non-lus de `userId` dans ce groupe. */
  markRead(groupId: string, userId: string, accessToken: string): Promise<void>;
}
