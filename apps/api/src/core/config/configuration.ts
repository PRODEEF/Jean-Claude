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
    // Tout passe par Vercel AI Gateway : une seule clé, et `llmModel` de la
    // forme `éditeur/modèle` désigne le moteur. Passer de Claude à Mistral ou
    // à DeepSeek se fait en changeant `LLM_MODEL`, sans toucher au code.
    // `llmProvider` ne sert plus qu'à brancher un jour un moteur hors Gateway.
    llmProvider: optional("LLM_PROVIDER", "gateway"),
    llmModel: optional("LLM_MODEL", "anthropic/claude-opus-5"),
    aiGatewayApiKey: optional("AI_GATEWAY_API_KEY", ""),
  };
};

export default configuration;

export type AppConfig = ReturnType<typeof configuration>;
