import type { CreateFeedback, Feedback, MessageRating, RateMessage } from "@jc/domain";
import type { IFeedbackRepository } from "./feedback.repository.interface.js";

export class FeedbackService {
  constructor(private readonly feedback: IFeedbackRepository) {}

  async submitGeneral(userId: string, input: CreateFeedback, accessToken: string): Promise<Feedback> {
    return this.feedback.createGeneral(userId, input, accessToken);
  }

  async rateMessage(
    userId: string,
    messageId: string,
    input: RateMessage,
    accessToken: string,
  ): Promise<MessageRating> {
    return this.feedback.rateMessage(userId, messageId, input, accessToken);
  }
}
