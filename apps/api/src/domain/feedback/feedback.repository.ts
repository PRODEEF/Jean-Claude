import type { CreateFeedback, Feedback, MessageRating, RateMessage } from "@jc/domain";
import { httpError } from "../../core/http.js";
import { forUser } from "../../core/supabase/supabase.js";
import type { IFeedbackRepository } from "./feedback.repository.interface.js";

/** Ligne Postgres — snake_case, telle que renvoyée par Supabase. */
type FeedbackRow = {
  id: string;
  category: string;
  content: string;
  platform: string;
  screen: string;
  created_at: string;
};

type MessageRatingRow = {
  id: string;
  message_id: string;
  rating: string;
  comment: string | null;
  platform: string;
  screen: string;
  created_at: string;
};

/**
 * Ce que Postgres refuse et qui se dit à l'utilisateur.
 *
 * `23503` (clé étrangère) signifie ici un `message_id` qui ne correspond à
 * aucun message — le message a pu être supprimé entre-temps.
 */
function toPublicError(error: { code: string; message: string }): Error {
  if (error.code === "23503") {
    return httpError(404, "Message introuvable.");
  }
  return new Error(error.message);
}

function toFeedback(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    category: row.category as Feedback["category"],
    content: row.content,
    platform: row.platform as Feedback["platform"],
    screen: row.screen,
    createdAt: row.created_at,
  };
}

function toMessageRating(row: MessageRatingRow): MessageRating {
  return {
    id: row.id,
    messageId: row.message_id,
    rating: row.rating as MessageRating["rating"],
    comment: row.comment,
    platform: row.platform as MessageRating["platform"],
    screen: row.screen,
    createdAt: row.created_at,
  };
}

const FEEDBACK_COLUMNS = "id, category, content, platform, screen, created_at";
const MESSAGE_RATING_COLUMNS = "id, message_id, rating, comment, platform, screen, created_at";

export const feedbackRepository: IFeedbackRepository = {
  async createGeneral(userId, input: CreateFeedback, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("feedback")
      .insert({
        user_id: userId,
        category: input.category,
        content: input.content,
        platform: input.platform,
        screen: input.screen,
      })
      .select(FEEDBACK_COLUMNS)
      .single();

    if (error) throw toPublicError(error);
    return toFeedback(data as unknown as FeedbackRow);
  },

  async rateMessage(userId, messageId, input: RateMessage, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("message_ratings")
      .upsert(
        {
          user_id: userId,
          message_id: messageId,
          rating: input.rating,
          comment: input.comment ?? null,
          platform: input.platform,
          screen: input.screen,
        },
        { onConflict: "user_id,message_id" },
      )
      .select(MESSAGE_RATING_COLUMNS)
      .single();

    if (error) throw toPublicError(error);
    return toMessageRating(data as unknown as MessageRatingRow);
  },
};
