/**
 * Configuration applicative.
 *
 * Résolue une seule fois, à l'import : une variable requise manquante fait
 * échouer le démarrage plutôt que de produire une erreur 500 au premier appel.
 */

function required(key: string): string {
  const value = process.env[key];
  if (!value?.trim()) {
    throw new Error(`Variable d'environnement requise manquante : ${key}`);
  }
  return value.trim();
}

function optional(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

const corsOrigin = process.env["CORS_ORIGIN"]?.trim();
if (optional("NODE_ENV", "development") === "production" && (!corsOrigin || corsOrigin === "*")) {
  throw new Error("CORS_ORIGIN doit être défini explicitement en production.");
}

export const config = {
  port: parseInt(optional("PORT", "3000"), 10),

  /** Origines autorisées, séparées par des virgules. `*` en dev uniquement. */
  corsOrigin: corsOrigin || "*",

  // ── Supabase ─────────────────────────────────────────────────────────────
  supabaseUrl: required("SUPABASE_URL"),
  supabaseAnonKey: required("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  // ── Moteur IA (§5.1) ─────────────────────────────────────────────────────
  // Tout passe par Vercel AI Gateway : une seule clé, et `llmModel` de la forme
  // `éditeur/modèle` désigne le moteur. Passer de Claude à Mistral ou à DeepSeek
  // se fait en changeant `LLM_MODEL`, sans toucher au code.
  aiGatewayApiKey: required("AI_GATEWAY_API_KEY"),

  // Modèle servi tant que l'utilisateur n'en a pas choisi un dans ses réglages
  // (§5.1). Il n'a pas à figurer au catalogue de `@jc/domain` : c'est ce qui
  // permet d'éprouver un moteur avant de le proposer.
  llmModel: optional("LLM_MODEL", "anthropic/claude-opus-5"),
} as const;
