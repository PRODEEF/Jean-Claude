/**
 * Port du moteur IA (§5.1).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * C'EST LA SEULE FAÇON D'APPELER UN MODÈLE DANS CETTE APPLICATION.
 *
 * Aucun service métier ne doit importer le SDK d'un moteur IA : ils reçoivent
 * `llm` et parlent à cette interface. Passer à Mistral, DeepSeek ou Qwen ne
 * demande alors pas une ligne de code métier — c'est ce qu'exige le §5.1 — et
 * pas même un adaptateur, l'unique implémentation passant par Vercel AI
 * Gateway qui les route tous.
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
};

/** Réponse complète, telle que l'événement `done` du flux la porte. */
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

  /**
   * Modèle actif, au format `éditeur/modèle`.
   *
   * Exposé pour que les réglages puissent montrer ce qui répond réellement,
   * plutôt que de le réécrire en dur côté client. Il reste choisi par le
   * serveur : le choix par l'utilisateur (§5.1) n'existe pas encore.
   */
  readonly model: string;

  /**
   * Réponse en flux — seule façon d'interroger le moteur.
   *
   * Pas de variante bloquante : elle ferait deux implémentations du même tour
   * de dialogue à tenir cohérentes, alors qu'un appelant qui veut la réponse
   * entière consomme le flux jusqu'au bout. Le flux est par ailleurs
   * indispensable à la perception de réactivité — les 3 apps de référence du
   * §4.2 affichent toutes le texte au fil de sa génération.
   */
  stream(request: LlmCompletionRequest): AsyncIterable<LlmStreamChunk>;
}

export type LlmStreamChunk =
  | { type: "text"; text: string }
  | { type: "tool_call"; toolCall: LlmToolCall }
  | { type: "done"; response: LlmCompletionResponse };
