import type { Conversation, Paginated } from "@jc/domain";

/** Message dont le contenu correspond au mot-clé, avec le fil dont il vient. */
export type MessageMatch = {
  conversationId: string;
  content: string;
};

export type ConversationPageOptions = {
  /** Restriction déjà calculée par le service. `undefined` = aucune. */
  ids?: string[];
  from?: string;
  to?: string;
  includeArchived: boolean;
  cursor?: string;
  limit: number;
};

export interface ISearchRepository {
  /** Conversations rattachées à au moins un des dossiers donnés (§5.2, A.1). */
  findIdsInFolders(folderIds: string[], accessToken: string): Promise<string[]>;

  /** Conversations dont le titre correspond au mot-clé. */
  findIdsByTitle(keyword: string, accessToken: string): Promise<string[]>;

  /** Messages dont le contenu correspond, du plus récent au plus ancien. */
  findMessageMatches(keyword: string, accessToken: string): Promise<MessageMatch[]>;

  findConversations(
    options: ConversationPageOptions,
    accessToken: string,
  ): Promise<Paginated<Conversation>>;
}
