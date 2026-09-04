import type { CreateFeedback, Feedback, MessageRating, RateMessage } from "@jc/domain";

export interface IFeedbackRepository {
  createGeneral(userId: string, input: CreateFeedback, accessToken: string): Promise<Feedback>;
  /** `upsert` sous le capot : renoter un message remplace la notation précédente. */
  rateMessage(
    userId: string,
    messageId: string,
    input: RateMessage,
    accessToken: string,
  ): Promise<MessageRating>;
}
