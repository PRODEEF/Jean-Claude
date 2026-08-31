/**
 * Configuration applicative.
 *
 * Toute variable requise est validée au démarrage : une clé manquante fait
 * échouer le boot plutôt que de produire une erreur 500 au premier appel.
 */
const configuration = () => {
  const required = (key: string): string => {
    const val = process.env[key];
    if (!val?.trim()) {
      throw new Error(`Variable d'environnement requise manquante : ${key}`);
    }
    return val.trim();
  };

  const optional = (key: string, fallback: string): string => process.env[key]?.trim() || fallback;

  const nodeEnv = optional("NODE_ENV", "development");

  const corsOriginRaw = process.env["CORS_ORIGIN"]?.trim();
  if (nodeEnv === "production" && (!corsOriginRaw || corsOriginRaw === "*")) {
    throw new Error("CORS_ORIGIN doit être défini explicitement en production.");
  }

  return {
    port: parseInt(optional("PORT", "3000"), 10),
    nodeEnv,
    isProduction: nodeEnv === "production",

    /** Origines autorisées, séparées par des virgules. `*` en dev uniquement. */
    corsOrigin: corsOriginRaw || "*",

    // ── Supabase ─────────────────────────────────────────────────────────
    supabaseUrl: required("SUPABASE_URL"),
    supabaseAnonKey: required("SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),

    // ── Moteur IA (§5.1) ─────────────────────────────────────────────────
    // `llmProvider` sélectionne l'implémentation de `LlmProvider` à injecter.
    // Ajouter Mistral ou DeepSeek = ajouter une classe + une entrée dans la
    // fabrique, sans toucher au code métier.
    llmProvider: optional("LLM_PROVIDER", "claude"),
    llmModel: optional("LLM_MODEL", "claude-opus-5"),
    anthropicApiKey: optional("ANTHROPIC_API_KEY", ""),
    mistralApiKey: optional("MISTRAL_API_KEY", ""),
    deepseekApiKey: optional("DEEPSEEK_API_KEY", ""),
  };
};

export default configuration;

export type AppConfig = ReturnType<typeof configuration>;
