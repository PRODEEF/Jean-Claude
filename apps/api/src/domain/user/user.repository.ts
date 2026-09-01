import type { AssistantScope, Theme, UpdateUserProfile } from "@jc/domain";
import { httpError } from "../../core/http.js";
import { forUser } from "../../core/supabase/supabase.js";
import type { IUserRepository, ProfileRecord } from "./user.repository.interface.js";

/** Ligne Postgres — snake_case, telle que renvoyée par Supabase. */
type ProfileRow = {
  id: string;
  display_name: string | null;
  memory: string | null;
  onboarding_completed_at: string | null;
  assistant_name: string;
  assistant_color: string;
  theme: string;
  timezone: string;
  speak_responses: boolean;
  assistant_scope: AssistantScope;
  created_at: string;
};

/**
 * Le mapping snake_case ↔ camelCase est confiné ici.
 *
 * Les préférences sont recomposées en un objet : elles vivent à plat en base —
 * une colonne par réglage se migre et s'indexe plus facilement qu'un jsonb —
 * mais le client les manipule groupées, comme le décrit `userProfileSchema`.
 */
function toEntity(row: ProfileRow): ProfileRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    memory: row.memory,
    onboardingCompletedAt: row.onboarding_completed_at,
    createdAt: row.created_at,
    preferences: {
      assistantName: row.assistant_name,
      assistantColor: row.assistant_color,
      theme: row.theme as Theme,
      timezone: row.timezone,
      speakResponses: row.speak_responses,
      scope: row.assistant_scope,
    },
  };
}

const COLUMNS =
  "id, display_name, memory, onboarding_completed_at, assistant_name, assistant_color, theme, timezone, speak_responses, assistant_scope, created_at";

export const userRepository: IUserRepository = {
  async findById(userId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("profiles")
      .select(COLUMNS)
      .eq("id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toEntity(data as unknown as ProfileRow) : null;
  },

  async update(userId, patch: UpdateUserProfile, accessToken) {
    // Un `undefined` doit laisser la colonne intacte ; on ne construit donc le
    // payload qu'à partir des clés fournies.
    const payload: Record<string, unknown> = {};
    if (patch.displayName !== undefined) payload["display_name"] = patch.displayName;
    if (patch.theme !== undefined) payload["theme"] = patch.theme;

    const { data, error } = await forUser(accessToken)
      .from("profiles")
      .update(payload)
      .eq("id", userId)
      .select(COLUMNS)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw httpError(404, "Profil introuvable.");
    return toEntity(data as unknown as ProfileRow);
  },
};
