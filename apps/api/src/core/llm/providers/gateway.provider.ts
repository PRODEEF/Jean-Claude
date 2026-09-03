import { isSovereignModel } from "@jc/domain";
import { createGateway, jsonSchema, streamText, tool, type ToolSet } from "ai";
import type { HTTPException } from "hono/http-exception";
import { config } from "../../config.js";
import { toHttpException } from "../llm-error.js";
import type {
  LlmCompletionRequest,
  LlmProvider,
  LlmStreamChunk,
  LlmTool,
  LlmToolCall,
} from "../llm.port.js";

/**
 * Adaptateur Vercel AI Gateway — unique moteur branché en V1 (§5.1).
 *
 * Seul fichier de l'application autorisé à importer un SDK de modèle IA.
 *
 * Le Gateway expose des centaines de modèles derrière une clé unique et un
 * identifiant de la forme `éditeur/modèle`. Conséquence directe : changer de
 * moteur — `anthropic/claude-opus-5` → `mistral/mistral-medium-3.5` — ne demande
 * plus d'écrire un adaptateur, seulement de changer `LLM_MODEL`. C'est plus
 * fort que ce que le §5.1 exigeait, qui se contentait de « sans réécriture
 * majeure ».
 */

/**
 * Au-delà, on considère le moteur perdu plutôt que de laisser la requête HTTP
 * pendre : sans borne, un Gateway qui ne répond pas immobilise une connexion
 * et l'utilisateur reste devant un écran qui tourne indéfiniment.
 */
const COMPLETION_TIMEOUT_MS = 60_000;

/** Assez pour une réponse conversationnelle longue, sans laisser filer le coût. */
const MAX_OUTPUT_TOKENS = 4096;

/**
 * En flux, ce qui compte n'est pas la durée totale — une longue réponse est
 * légitime — mais le délai avant le premier jeton : c'est lui qui prouve que
 * la génération a démarré.
 */
const FIRST_CHUNK_TIMEOUT_MS = 15_000;

class GatewayProvider implements LlmProvider {
  readonly name = "gateway";
  readonly isSovereign: boolean;

  readonly model: string;

  private readonly gateway = createGateway({ apiKey: config.aiGatewayApiKey });

  /**
   * Un modèle du SDK par identifiant déjà rencontré.
   *
   * Le choix appartenant à l'utilisateur (§5.1), plusieurs modèles coexistent
   * au sein d'un même processus. Les reconstruire à chaque tour est inutile —
   * l'objet ne porte qu'une configuration d'appel — et le nombre
   * d'identifiants possibles est borné par le catalogue de `@jc/domain`.
   */
  private readonly languageModels = new Map<string, ReturnType<typeof this.gateway>>();

  constructor() {
    this.model = config.llmModel;
    this.isSovereign = isSovereignModel(this.model);
  }

  /** Éditeur du modèle — `anthropic`, `mistral`, `deepseek`... */
  private creatorOf(model: string): string {
    return model.split("/")[0] ?? "unknown";
  }

  private languageModelFor(model: string): ReturnType<typeof this.gateway> {
    const known = this.languageModels.get(model);
    if (known) return known;

    const built = this.gateway(model);
    this.languageModels.set(model, built);
    return built;
  }

  async *stream(request: LlmCompletionRequest): AsyncIterable<LlmStreamChunk> {
    // L'AI SDK ne relaie pas l'échec du fournisseur sur le flux : il le passe à
    // `onError`, puis rejette les promesses de résultat avec un
    // `NoOutputGeneratedError` qui, lui, ne porte aucun statut. Sans le garder
    // de côté ici, un quota dépassé ressortirait en panne générique.
    let streamError: unknown;

    // Le modèle demandé n'est pas relu ici : la route l'a déjà validé contre le
    // catalogue. Le laisser passer tel quel garde l'adaptateur utilisable avec
    // un `LLM_MODEL` hors catalogue, ce dont le développement a besoin.
    const model = request.model ?? this.model;

    try {
      const result = streamText({
        model: this.languageModelFor(model),
        timeout: { totalMs: COMPLETION_TIMEOUT_MS, firstChunkMs: FIRST_CHUNK_TIMEOUT_MS },
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // Remplace le `console.error` par défaut du SDK, qui déverse la requête
        // envoyée au modèle — donc le prompt de l'utilisateur — dans les logs.
        onError: ({ error }) => {
          streamError = error;
        },
        ...(request.system ? { system: request.system } : {}),
        ...(request.tools?.length ? { tools: toToolSet(request.tools) } : {}),
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      });

      let text = "";
      for await (const delta of result.textStream) {
        text += delta;
        yield { type: "text", text: delta };
      }

      // Les appels d'outils ne sont complets qu'une fois le flux terminé : on
      // les émet à la fin plutôt que d'assembler nous-mêmes le JSON partiel.
      const toolCalls = (await result.toolCalls).map(toToolCall);
      for (const toolCall of toolCalls) {
        yield { type: "tool_call", toolCall };
      }

      const usage = await result.usage;

      yield {
        type: "done",
        response: {
          text,
          toolCalls,
          provider: this.creatorOf(model),
          model: (await result.response).modelId,
          usage: {
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
          },
        },
      };
    } catch (error) {
      throw this.fail("Échec du flux du moteur IA", streamError ?? error);
    }
  }

  private fail(context: string, error: unknown): HTTPException {
    console.error(context, error instanceof Error ? error.stack : error);
    return toHttpException(error);
  }
}

/**
 * Traduit les outils du port vers la forme attendue par l'AI SDK : un objet
 * indexé par nom, et non un tableau.
 *
 * Aucun `execute` n'est fourni, volontairement. C'est ce qui fait que le
 * modèle *propose* sans jamais agir : l'appel d'outil remonte tel quel au
 * service, qui en fera une suggestion en attente (§12.1).
 */
function toToolSet(tools: LlmTool[]): ToolSet {
  return Object.fromEntries(
    tools.map((t) => [
      t.name,
      tool({
        description: t.description,
        inputSchema: jsonSchema<Record<string, unknown>>(t.inputSchema),
      }),
    ]),
  );
}

function toToolCall(call: { toolCallId: string; toolName: string; input: unknown }): LlmToolCall {
  return {
    id: call.toolCallId,
    name: call.toolName,
    input: (call.input ?? {}) as Record<string, unknown>,
  };
}

/**
 * Moteur actif de l'application.
 *
 * Instance unique, construite à l'import : les appelants dépendent du type
 * `LlmProvider`, jamais de la classe, ce qui garde le §5.1 intact — substituer
 * un autre adaptateur ne touche que cette ligne.
 */
export const llm: LlmProvider = new GatewayProvider();
