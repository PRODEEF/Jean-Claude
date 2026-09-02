import {
  messageStreamEventSchema,
  type AssignFolders,
  type CalendarEvent,
  type CalendarRange,
  type Conversation,
  type CreateCalendarEvent,
  type CreateConversation,
  type CreateFolder,
  type Folder,
  type FolderTreeNode,
  type Message,
  type MessageStreamEvent,
  type Paginated,
  type ResolveSuggestion,
  type SearchFilters,
  type SearchResult,
  type SendMessage,
  type Suggestion,
  type UpdateCalendarEvent,
  type UpdateConversation,
  type UpdateFolder,
  type UpdateUserProfile,
  type UserProfile,
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
      this.http.request<{
        status: string;
        llm: { provider: string; model: string; sovereign: boolean };
      }>("/health"),
  };

  /** Profil et préférences de l'utilisateur connecté. */
  readonly me = {
    profile: () => this.http.request<UserProfile>("/me"),

    update: (patch: UpdateUserProfile) =>
      this.http.request<UserProfile>("/me", { method: "PATCH", body: patch }),
  };

  readonly folders = {
    tree: () => this.http.request<FolderTreeNode[]>("/folders"),

    create: (input: CreateFolder) =>
      this.http.request<Folder>("/folders", { method: "POST", body: input }),

    update: (id: string, patch: UpdateFolder) =>
      this.http.request<Folder>(`/folders/${id}`, { method: "PATCH", body: patch }),

    remove: (id: string) => this.http.request<void>(`/folders/${id}`, { method: "DELETE" }),
  };

  /**
   * Calendrier (§3 Phase B).
   *
   * La fenêtre est bornée par l'appelant : la vue mois et la vue semaine
   * n'appellent pas deux routes différentes, elles demandent deux fenêtres.
   */
  readonly calendar = {
    list: (range: CalendarRange) =>
      this.http.request<CalendarEvent[]>("/calendar", { query: range }),

    create: (input: CreateCalendarEvent) =>
      this.http.request<CalendarEvent>("/calendar", { method: "POST", body: input }),

    update: (id: string, patch: UpdateCalendarEvent) =>
      this.http.request<CalendarEvent>(`/calendar/${id}`, { method: "PATCH", body: patch }),

    remove: (id: string) => this.http.request<void>(`/calendar/${id}`, { method: "DELETE" }),
  };

  /**
   * Canal permanent Jean-Claude (A.10).
   *
   * Les propositions de l'assistant vivent hors du fil des messages : elles
   * survivent au rechargement tant que l'utilisateur ne les a pas tranchées,
   * ce qu'un événement de flux ne permettrait pas (§12.1).
   */
  readonly assistant = {
    suggestions: (conversationId: string) =>
      this.http.request<Suggestion[]>("/assistant/suggestions", { query: { conversationId } }),

    /** Accepte ou ignore d'un geste. Rend les dossiers réellement créés. */
    resolve: (id: string, input: ResolveSuggestion) =>
      this.http.request<{ suggestion: Suggestion; folders: Folder[] }>(
        `/assistant/suggestions/${id}/resolve`,
        { method: "POST", body: input },
      ),
  };

  /**
   * Recherche par filtres (A.6).
   *
   * Les listes et les booléens sont mis à plat ici : une chaîne de requête ne
   * porte que du texte, et `searchQuerySchema` décrit côté serveur exactement
   * ce format-là.
   */
  readonly search = {
    conversations: (filters: Partial<SearchFilters> & { cursor?: string } = {}) =>
      this.http.request<Paginated<SearchResult>>("/search", {
        query: {
          ...(filters.query ? { query: filters.query } : {}),
          ...(filters.folderIds?.length ? { folderIds: filters.folderIds.join(",") } : {}),
          ...(filters.shortcut ? { shortcut: filters.shortcut } : {}),
          ...(filters.from ? { from: filters.from } : {}),
          ...(filters.to ? { to: filters.to } : {}),
          ...(filters.includeArchived ? { includeArchived: "true" } : {}),
          ...(filters.limit ? { limit: filters.limit } : {}),
          ...(filters.cursor ? { cursor: filters.cursor } : {}),
        },
      }),
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

    /**
     * Envoie un message et rend la réponse de l'assistant au fil de sa
     * génération.
     *
     * Un générateur ne pouvant pas s'écrire en fonction fléchée, il vit dans
     * une méthode privée : c'est le seul moyen de garder `this` lié à
     * l'instance comme le font les autres entrées de cet objet.
     */
    send: (id: string, input: SendMessage, signal?: AbortSignal) =>
      this.streamMessage(id, input, signal),
  };
  /**
   * Les événements sont validés à l'arrivée par le schéma de `@jc/domain` :
   * un flux tronqué, ou un contrat qui aurait divergé entre le serveur et le
   * client, échoue ici plutôt que trois écrans plus loin.
   */
  private async *streamMessage(
    id: string,
    input: SendMessage,
    signal?: AbortSignal,
  ): AsyncGenerator<MessageStreamEvent> {
    const blocks = this.http.stream(`/conversations/${id}/messages`, {
      method: "POST",
      body: input,
      ...(signal ? { signal } : {}),
    });

    for await (const block of blocks) {
      yield messageStreamEventSchema.parse(JSON.parse(block));
    }
  }
}
