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
      /** Titre de la conversation dédiée que le message propose d'ouvrir (A.10). */
      redirectTitle?: string | null;
    },
    accessToken: string,
  ): Promise<Message>;

  findMessage(id: string, accessToken: string): Promise<Message | null>;

  /** Corrige le texte d'un message déjà envoyé, sans toucher au reste. */
  updateMessageContent(id: string, content: string, accessToken: string): Promise<Message>;

  deleteMessage(id: string, accessToken: string): Promise<void>;

  /**
   * Efface la suite du fil à partir de `createdAt`, exclu.
   *
   * Sert à rejouer un tour : ce qui suivait répondait au texte d'avant, et le
   * garder ferait un fil qui se contredit.
   */
  deleteMessagesAfter(
    conversationId: string,
    createdAt: string,
    accessToken: string,
  ): Promise<void>;

  /** Horodate la validation de la bascule proposée par ce message (A.10). */
  acceptRedirect(id: string, accessToken: string): Promise<Message>;
}
