import type {
  AssignFolders,
  Conversation,
  CreateConversation,
  CreateFolder,
  Folder,
  FolderTreeNode,
  Message,
  Paginated,
  SendMessage,
  UpdateConversation,
  UpdateFolder,
} from "@jc/domain";
import { HttpClient, type ApiClientOptions } from "./http";

/**
 * Client de l'API Jean-Claude.
 *
 * Les types de retour viennent de `@jc/domain`, le même package que celui
 * utilisé par le backend pour produire ces réponses : une divergence de
 * contrat casse la compilation des deux côtés au lieu de passer inaperçue
 * jusqu'à l'exécution.
 */
export class JeanClaudeClient {
  private readonly http: HttpClient;

  constructor(options: ApiClientOptions) {
    this.http = new HttpClient(options);
  }

  readonly health = {
    check: () =>
      this.http.request<{ status: string; llm: { provider: string; sovereign: boolean } }>(
        "/health",
      ),
  };

  readonly folders = {
    tree: () => this.http.request<FolderTreeNode[]>("/folders"),

    create: (input: CreateFolder) =>
      this.http.request<Folder>("/folders", { method: "POST", body: input }),

    update: (id: string, patch: UpdateFolder) =>
      this.http.request<Folder>(`/folders/${id}`, { method: "PATCH", body: patch }),

    remove: (id: string) => this.http.request<void>(`/folders/${id}`, { method: "DELETE" }),
  };

  readonly conversations = {
    list: (params: { cursor?: string; limit?: number; includeArchived?: boolean } = {}) =>
      this.http.request<Paginated<Conversation>>("/conversations", { query: params }),

    get: (id: string) => this.http.request<Conversation>(`/conversations/${id}`),

    /** Canal permanent Jean-Claude — créé au premier accès (A.10). */
    assistantChannel: () => this.http.request<Conversation>("/conversations/assistant"),

    create: (input: CreateConversation) =>
      this.http.request<Conversation>("/conversations", { method: "POST", body: input }),

    update: (id: string, patch: UpdateConversation) =>
      this.http.request<Conversation>(`/conversations/${id}`, { method: "PATCH", body: patch }),

    remove: (id: string) => this.http.request<void>(`/conversations/${id}`, { method: "DELETE" }),

    /** Rangement matriciel : remplace l'ensemble des dossiers (§5.2, A.1). */
    assignFolders: (id: string, input: AssignFolders) =>
      this.http.request<Conversation>(`/conversations/${id}/folders`, {
        method: "PUT",
        body: input,
      }),

    messages: (id: string, params: { cursor?: string; limit?: number } = {}) =>
      this.http.request<Paginated<Message>>(`/conversations/${id}/messages`, { query: params }),

    send: (id: string, input: SendMessage) =>
      this.http.request<{ userMessage: Message; assistantMessage: Message }>(
        `/conversations/${id}/messages`,
        { method: "POST", body: input },
      ),
  };
}
