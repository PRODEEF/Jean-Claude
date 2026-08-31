/**
 * Port du moteur IA (§5.1).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * C'EST LA SEULE FAÇON D'APPELER UN MODÈLE DANS CETTE APPLICATION.
 *
 * Aucun service métier ne doit importer le SDK d'un moteur IA : ils injectent
 * `LLM_PROVIDER` et parlent à cette interface. Passer à Mistral, DeepSeek ou
 * Qwen ne demande alors pas une ligne de code métier — c'est ce qu'exige le
 * §5.1 — et pas même un adaptateur, l'unique implémentation passant par
 * Vercel AI Gateway qui les route tous.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type LlmRole = "user" | "assistant";

export type LlmMessage = {
  role: LlmRole;
  content: string;
};

/**
 * Outil que le modèle peut décider d'appeler.
 *
 * C'est le mécanisme qui porte l'intelligence proactive du §12.1 : plutôt que
 * de parser la réponse en langage naturel pour deviner qu'une todoliste se
 * dessine, on expose au modèle des outils (`suggest_task_list`,
 * `suggest_schedule`...) et on lit ses appels d'outils de façon structurée.
 */
export type LlmTool = {
  name: string;
  description: string;
  /** JSON Schema des paramètres attendus. */
  inputSchema: Record<string, unknown>;
};

export type LlmToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type LlmCompletionRequest = {
  /** Consigne système : périmètre du canal permanent, contexte utilisateur... */
  system?: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  maxTokens?: number;
  temperature?: number;
};

export type LlmCompletionResponse = {
  text: string;
  toolCalls: LlmToolCall[];
  /** Identité du moteur ayant produit la réponse — persistée avec le message. */
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
};

export interface LlmProvider {
  /** Identifiant court du fournisseur : `claude`, `mistral`, `deepseek`... */
  readonly name: string;

  /**
   * Hébergement et opérateur en France/UE (§5.1).
   *
   * Exposé dans l'API pour pouvoir afficher à l'utilisateur si le modèle qui
   * traite ses données est souverain — Mistral l'est, Claude ne l'est pas.
   * Nécessaire à la transparence exigée au §13.4.6.
   */
  readonly isSovereign: boolean;

  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;

  /**
   * Réponse en flux. Indispensable à la perception de réactivité d'une app
   * conversationnelle : les 3 apps de référence du §4.2 affichent toutes le
   * texte au fil de sa génération.
   */
  stream(request: LlmCompletionRequest): AsyncIterable<LlmStreamChunk>;
}

export type LlmStreamChunk =
  | { type: "text"; text: string }
  | { type: "tool_call"; toolCall: LlmToolCall }
  | { type: "done"; response: LlmCompletionResponse };

/** Jeton d'injection Nest — les services dépendent du port, jamais d'une classe concrète. */
export const LLM_PROVIDER = Symbol("LlmProvider");
