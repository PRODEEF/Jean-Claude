import type {
  Conversation,
  CreateConversation,
  FolderAssignmentSource,
  Message,
  Paginated,
  SendMessage,
  UpdateConversation,
} from "@jc/domain";

export interface IConversationRepository {
  findAll(
    accessToken: string,
    options: { cursor?: string; limit: number; includeArchived: boolean },
  ): Promise<Paginated<Conversation>>;

  findById(id: string, accessToken: string): Promise<Conversation | null>;

  /** Canal permanent Jean-Claude — un seul par utilisateur (A.10). */
  findAssistantChannel(accessToken: string): Promise<Conversation | null>;

  create(
    userId: string,
    input: CreateConversation,
    kind: Conversation["kind"],
    accessToken: string,
  ): Promise<Conversation>;

  update(id: string, patch: UpdateConversation, accessToken: string): Promise<Conversation>;

  delete(id: string, accessToken: string): Promise<void>;

  /** Remplace l'ensemble des rattachements de la conversation (§5.2, A.1). */
  setFolders(
    conversationId: string,
    folderIds: string[],
    source: FolderAssignmentSource,
    accessToken: string,
  ): Promise<string[]>;

  listMessages(
    conversationId: string,
    accessToken: string,
    options: { cursor?: string; limit: number },
  ): Promise<Paginated<Message>>;

  appendMessage(
    conversationId: string,
    userId: string,
    message: SendMessage & {
      role: Message["role"];
      provider?: string | null;
      model?: string | null;
      /** Réponses proposées sous une question de l'assistant. */
      choices?: string[] | null;
    },
    accessToken: string,
  ): Promise<Message>;
}
