import type { Suggestion } from "@jc/domain";
import { httpError } from "../../core/http.js";
import { forUser } from "../../core/supabase/supabase.js";
import type { ISuggestionRepository } from "./suggestion.repository.interface.js";

/** Ligne Postgres — snake_case, telle que renvoyée par Supabase. */
type SuggestionRow = {
  id: string;
  kind: string;
  status: string;
  conversation_id: string | null;
  message: string;
  payload: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
};

/**
 * Le mapping snake_case ↔ camelCase est confiné ici.
 *
 * `kind` et `status` sont élargis par le pilote Supabase, mais la table les
 * borne par une contrainte CHECK aux mêmes valeurs que les énumérés de
 * `@jc/domain` : la conversion est garantie par le schéma.
 */
function toEntity(row: SuggestionRow): Suggestion {
  return {
    id: row.id,
    kind: row.kind as Suggestion["kind"],
    status: row.status as Suggestion["status"],
    conversationId: row.conversation_id,
    message: row.message,
    payload: row.payload,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

const COLUMNS = "id, kind, status, conversation_id, message, payload, created_at, resolved_at";

export const suggestionRepository: ISuggestionRepository = {
  async create(userId, input, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("assistant_suggestions")
      .insert({
        user_id: userId,
        conversation_id: input.conversationId,
        kind: input.kind,
        message: input.message,
        payload: input.payload,
      })
      .select(COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return toEntity(data as unknown as SuggestionRow);
  },

  async findById(id, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("assistant_suggestions")
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toEntity(data as unknown as SuggestionRow) : null;
  },

  async listPending(conversationId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("assistant_suggestions")
      .select(COLUMNS)
      .eq("conversation_id", conversationId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data as unknown as SuggestionRow[]).map(toEntity);
  },

  async listForConversation(conversationId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("assistant_suggestions")
      .select(COLUMNS)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data as unknown as SuggestionRow[]).map(toEntity);
  },

  async markResolved(id, status, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("assistant_suggestions")
      .update({ status, resolved_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw httpError(404, "Proposition introuvable.");
    return toEntity(data as unknown as SuggestionRow);
  },
};
