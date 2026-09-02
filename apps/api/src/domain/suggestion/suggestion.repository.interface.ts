import type { Suggestion, SuggestionKind, SuggestionStatus } from "@jc/domain";

/**
 * Suggestion à persister. Le statut n'y figure pas : une suggestion naît
 * toujours en attente, c'est ce qui fait qu'elle n'exécute rien (§12.1).
 */
export type CreateSuggestion = {
  conversationId: string;
  kind: SuggestionKind;
  message: string;
  payload: Record<string, unknown>;
};

export interface ISuggestionRepository {
  create(userId: string, input: CreateSuggestion, accessToken: string): Promise<Suggestion>;
  findById(id: string, accessToken: string): Promise<Suggestion | null>;
  /** Suggestions encore en attente d'un geste, de la plus ancienne à la plus récente. */
  listPending(conversationId: string, accessToken: string): Promise<Suggestion[]>;
  /**
   * Toutes les suggestions du fil, tranchées comprises, de la plus ancienne à
   * la plus récente : ce que l'assistant a proposé fait partie de l'historique
   * de la conversation, au même titre que ce qu'il a dit.
   */
  listForConversation(conversationId: string, accessToken: string): Promise<Suggestion[]>;
  /**
   * `payload` n'est fourni que lorsque l'acceptation a restreint la
   * proposition : la trace qui reste dans le fil doit dire ce qui a été fait,
   * pas ce qui avait été proposé.
   */
  markResolved(
    id: string,
    status: SuggestionStatus,
    accessToken: string,
    payload?: Record<string, unknown>,
  ): Promise<Suggestion>;
}
