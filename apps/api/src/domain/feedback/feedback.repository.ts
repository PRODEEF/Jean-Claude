import { randomUUID } from "node:crypto";
import type {
  CreateFeedback,
  Feedback,
  FeedbackAuthor,
  MessageRating,
  RateMessage,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import { forUser } from "../../core/supabase/supabase.js";
import type {
  AuthoredFeedback,
  AuthoredRating,
  IFeedbackRepository,
} from "./feedback.repository.interface.js";

/** Ligne Postgres — snake_case, telle que renvoyée par Supabase. */
type FeedbackRow = {
  id: string;
  category: string;
  content: string;
  platform: string;
  screen: string;
  status: string;
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
    status: row.status as Feedback["status"],
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

type AuthorRow = { user_id: string; display_name: string | null; email: string | null };

function toAuthor(row: AuthorRow): FeedbackAuthor {
  return { id: row.user_id, displayName: row.display_name, email: row.email };
}

const FEEDBACK_COLUMNS = "id, category, content, platform, screen, status, created_at";
const MESSAGE_RATING_COLUMNS = "id, message_id, rating, comment, platform, screen, created_at";

/**
 * Plafond d'une lecture de revue, par table.
 *
 * La bêta compte une poignée de testeurs : la revue les montre tous d'un bloc,
 * regroupés par personne, ce que la pagination par curseur découperait mal.
 * Le plafond borne la réponse si le volume venait à dépasser la bêta.
 */
const REVIEW_LIMIT = 500;

export const feedbackRepository: IFeedbackRepository = {
  async createGeneral(userId, input: CreateFeedback, accessToken) {
    // Composé ici plutôt que relu : la RLS ne laisse plus l'auteur lire ses
    // retours, et un `insert … returning` serait refusé.
    const feedback: Feedback = {
      id: randomUUID(),
      category: input.category,
      content: input.content,
      platform: input.platform,
      screen: input.screen,
      status: "new",
      createdAt: new Date().toISOString(),
    };

    const { error } = await forUser(accessToken).from("feedback").insert({
      id: feedback.id,
      user_id: userId,
      category: feedback.category,
      content: feedback.content,
      platform: feedback.platform,
      screen: feedback.screen,
      created_at: feedback.createdAt,
    });

    if (error) throw toPublicError(error);
    return feedback;
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

  async isAdmin(accessToken) {
    const { data, error } = await forUser(accessToken).rpc("is_admin");

    if (error) throw new Error(error.message);
    return data === true;
  },

  async listFeedback(accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("feedback")
      .select(`user_id, ${FEEDBACK_COLUMNS}`)
      .order("created_at", { ascending: false })
      .limit(REVIEW_LIMIT);

    if (error) throw new Error(error.message);

    return (data as unknown as (FeedbackRow & { user_id: string })[]).map(
      (row): AuthoredFeedback => ({ ...toFeedback(row), userId: row.user_id }),
    );
  },

  async listRatings(accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("message_ratings")
      .select(`user_id, ${MESSAGE_RATING_COLUMNS}`)
      .order("created_at", { ascending: false })
      .limit(REVIEW_LIMIT);

    if (error) throw new Error(error.message);

    return (data as unknown as (MessageRatingRow & { user_id: string })[]).map(
      (row): AuthoredRating => ({ ...toMessageRating(row), userId: row.user_id }),
    );
  },

  async listAuthors(accessToken) {
    const { data, error } = await forUser(accessToken).rpc("feedback_authors");

    if (error) throw new Error(error.message);
    return (data as unknown as AuthorRow[]).map(toAuthor);
  },

  async updateStatus(id, status, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("feedback")
      .update({ status })
      .eq("id", id)
      .select(FEEDBACK_COLUMNS)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toFeedback(data as unknown as FeedbackRow) : null;
  },
};
