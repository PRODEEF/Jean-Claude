import type {
  CreateFeedback,
  Feedback,
  FeedbackAuthor,
  FeedbackStatus,
  MessageRating,
  RateMessage,
} from "@jc/domain";

/** Retour lu pour la revue : avec son auteur, pour le regrouper par testeur. */
export type AuthoredFeedback = Feedback & { userId: string };
export type AuthoredRating = MessageRating & { userId: string };

export interface IFeedbackRepository {
  createGeneral(userId: string, input: CreateFeedback, accessToken: string): Promise<Feedback>;
  /** `upsert` sous le capot : renoter un message remplace la notation précédente. */
  rateMessage(
    userId: string,
    messageId: string,
    input: RateMessage,
    accessToken: string,
  ): Promise<MessageRating>;
  /** L'appelant fait-il partie de l'équipe habilitée à lire les retours ? */
  isAdmin(accessToken: string): Promise<boolean>;
  /**
   * Retours de tous les testeurs, du plus récent au plus ancien — pour un
   * admin seulement : la RLS n'en rend aucun à un autre compte, pas même les
   * siens.
   */
  listFeedback(accessToken: string): Promise<AuthoredFeedback[]>;
  /** Même lecture que `listFeedback`, pour les notations de réponses. */
  listRatings(accessToken: string): Promise<AuthoredRating[]>;
  /** Auteurs d'au moins un retour ou une notation — vide pour qui n'est pas admin. */
  listAuthors(accessToken: string): Promise<FeedbackAuthor[]>;
  /** `null` quand le retour n'existe pas, ou n'est pas visible de l'appelant. */
  updateStatus(id: string, status: FeedbackStatus, accessToken: string): Promise<Feedback | null>;
}
