import { toAssistantModel, type AssistantScope, type Theme } from "@jc/domain";
import { httpError } from "../../core/http.js";
import { admin, forUser } from "../../core/supabase/supabase.js";
import type { IUserRepository, ProfilePatch, ProfileRecord } from "./user.repository.interface.js";

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
  llm_model: string | null;
  assistant_scope: AssistantScope;
  flat_banner: boolean;
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
      // Un modèle retiré du catalogue depuis le choix de l'utilisateur est relu
      // comme « celui du serveur », plutôt que de rendre le profil illisible.
      llmModel: toAssistantModel(row.llm_model),
      scope: row.assistant_scope,
      flatBanner: row.flat_banner,
    },
  };
}

const COLUMNS =
  "id, display_name, memory, onboarding_completed_at, assistant_name, assistant_color, theme, timezone, llm_model, assistant_scope, flat_banner, created_at";

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

  async update(userId, patch: ProfilePatch, accessToken) {
    // Un `undefined` doit laisser la colonne intacte ; on ne construit donc le
    // payload qu'à partir des clés fournies.
    const payload: Record<string, unknown> = {};
    if (patch.displayName !== undefined) payload["display_name"] = patch.displayName;
    if (patch.theme !== undefined) payload["theme"] = patch.theme;
    if (patch.assistantName !== undefined) payload["assistant_name"] = patch.assistantName;
    if (patch.assistantColor !== undefined) payload["assistant_color"] = patch.assistantColor;
    if (patch.timezone !== undefined) payload["timezone"] = patch.timezone;
    // `null` est ici une valeur choisie — « rends la main au serveur » — et non
    // l'absence de réglage : elle doit donc bien être écrite.
    if (patch.llmModel !== undefined) payload["llm_model"] = patch.llmModel;
    // Le périmètre arrive complet du Service : l'écrire remplace le `jsonb`
    // entier, ce qui est la sémantique attendue ici.
    if (patch.scope !== undefined) payload["assistant_scope"] = patch.scope;
    if (patch.flatBanner !== undefined) payload["flat_banner"] = patch.flatBanner;

    return write(userId, payload, accessToken);
  },

  async completeOnboarding(userId, memory, accessToken) {
    const payload: Record<string, unknown> = { onboarding_completed_at: new Date().toISOString() };
    if (memory !== null) payload["memory"] = memory;

    return write(userId, payload, accessToken);
  },

  /**
   * **Exception documentée** à la règle 100-api / `core/supabase/supabase.ts`
   * (« `admin` contourne les RLS, réservé aux traitements système, jamais
   * dans un chemin déclenché par une requête HTTP ») : GoTrue n'expose la
   * suppression d'un compte que via l'API Admin (clé service_role), et
   * `auth.users` n'a pas de policy RLS à respecter — `forUser` n'a ici aucune
   * prise possible, il n'existe pas d'alternative respectant la règle à la
   * lettre.
   *
   * Isolée à cette seule méthode plutôt que laissée comme un simple
   * commentaire : `userId` est toujours `owner.id`, posé par le middleware
   * depuis le token vérifié, jamais un `:id` de route (voir user.routes.ts) —
   * pas de fuite possible entre comptes malgré le contournement des RLS.
   *
   * Rien d'autre à supprimer ici : la cascade du schéma SQL sur
   * `auth.users(id) on delete cascade` efface profil, dossiers,
   * conversations, messages, todolistes, calendrier, suggestions et feedback.
   */
  async deleteAccount(userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
  },
};

/** Écriture partielle sur `profiles`, commune aux deux mises à jour. */
async function write(
  userId: string,
  payload: Record<string, unknown>,
  accessToken: string,
): Promise<ProfileRecord> {
  const { data, error } = await forUser(accessToken)
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw httpError(404, "Profil introuvable.");
  return toEntity(data as unknown as ProfileRow);
}
