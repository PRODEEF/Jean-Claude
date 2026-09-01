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
  markResolved(id: string, status: SuggestionStatus, accessToken: string): Promise<Suggestion>;
}
