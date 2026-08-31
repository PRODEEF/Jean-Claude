import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createGateway, generateText, jsonSchema, streamText, tool, type ToolSet } from "ai";
import type {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmProvider,
  LlmStreamChunk,
  LlmTool,
  LlmToolCall,
} from "../llm.port";

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

@Injectable()
export class GatewayProvider implements LlmProvider {
  readonly name = "gateway";
  readonly isSovereign: boolean;

  private readonly logger = new Logger(GatewayProvider.name);
  private readonly model: ReturnType<ReturnType<typeof createGateway>>;
  private readonly modelId: string;
  /** Éditeur du modèle actif — `anthropic`, `mistral`, `deepseek`... */
  private readonly creator: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>("aiGatewayApiKey");
    if (!apiKey) {
      throw new Error("AI_GATEWAY_API_KEY est requis pour joindre le moteur IA.");
    }

    this.modelId = config.get<string>("llmModel") ?? "anthropic/claude-opus-5";
    this.creator = this.modelId.split("/")[0] ?? "unknown";
    this.isSovereign = SOVEREIGN_CREATORS.has(this.creator);

    this.model = createGateway({ apiKey })(this.modelId);
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    try {
      const result = await generateText({
        model: this.model,
        ...this.callOptions(request),
      });

      return {
        text: result.text,
        toolCalls: result.toolCalls.map(toToolCall),
        provider: this.creator,
        model: result.response.modelId,
        usage: {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
        },
      };
    } catch (error) {
      throw this.fail("Échec de l'appel au moteur IA", error);
    }
  }

  async *stream(request: LlmCompletionRequest): AsyncIterable<LlmStreamChunk> {
    try {
      const result = streamText({
        model: this.model,
        ...this.callOptions(request),
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

  /** Partie commune de la requête, identique en mode bloquant et en flux. */
  private callOptions(request: LlmCompletionRequest) {
    return {
      maxOutputTokens: request.maxTokens ?? 4096,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.system ? { system: request.system } : {}),
      ...(request.tools?.length ? { tools: toToolSet(request.tools) } : {}),
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
    };
  }

  /**
   * On ne laisse pas fuiter l'erreur du fournisseur vers le client : elle peut
   * contenir des fragments de prompt, donc des données utilisateur.
   */
  private fail(context: string, error: unknown): ServiceUnavailableException {
    this.logger.error(context, error instanceof Error ? error.stack : error);
    return new ServiceUnavailableException("Le moteur IA est momentanément indisponible.");
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
