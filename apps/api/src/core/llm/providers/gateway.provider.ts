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
 * moteur — `anthropic/claude-opus-5` → `mistral/mistral-large` — ne demande
 * plus d'écrire un adaptateur, seulement de changer `LLM_MODEL`. C'est plus
 * fort que ce que le §5.1 exigeait, qui se contentait de « sans réécriture
 * majeure ».
 */

/**
 * Éditeurs hébergeant et opérant en France/UE (§5.1, §13.4.6).
 *
 * La souveraineté se lit sur l'éditeur du modèle, pas sur le Gateway qui n'est
 * qu'un routeur : c'est bien Mistral ou Anthropic qui traite le contenu des
 * conversations de l'utilisateur.
 */
const SOVEREIGN_CREATORS = new Set(["mistral"]);

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

  private readonly languageModel: ReturnType<ReturnType<typeof createGateway>>;
  /** Éditeur du modèle actif — `anthropic`, `mistral`, `deepseek`... */
  private readonly creator: string;

  constructor() {
    this.model = config.llmModel;
    this.creator = this.model.split("/")[0] ?? "unknown";
    this.isSovereign = SOVEREIGN_CREATORS.has(this.creator);

    this.languageModel = createGateway({ apiKey: config.aiGatewayApiKey })(this.model);
  }

  async *stream(request: LlmCompletionRequest): AsyncIterable<LlmStreamChunk> {
    try {
      const result = streamText({
        model: this.languageModel,
        timeout: { totalMs: COMPLETION_TIMEOUT_MS, firstChunkMs: FIRST_CHUNK_TIMEOUT_MS },
        maxOutputTokens: MAX_OUTPUT_TOKENS,
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
          provider: this.creator,
          model: (await result.response).modelId,
          usage: {
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
          },
        },
      };
    } catch (error) {
      throw this.fail("Échec du flux du moteur IA", error);
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
