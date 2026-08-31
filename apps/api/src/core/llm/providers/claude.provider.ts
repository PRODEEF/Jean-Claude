import Anthropic from "@anthropic-ai/sdk";
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmProvider,
  LlmStreamChunk,
  LlmToolCall,
} from "../llm.port";

/**
 * Adaptateur Claude (Anthropic) — moteur par défaut de la V1 (§5.1).
 *
 * Seul fichier de l'application autorisé à importer `@anthropic-ai/sdk`.
 */
@Injectable()
export class ClaudeProvider implements LlmProvider {
  readonly name = "claude";
  /** Anthropic héberge hors UE — à signaler à l'utilisateur (§5.1, §13.4.6). */
  readonly isSovereign = false;

  private readonly logger = new Logger(ClaudeProvider.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>("anthropicApiKey");
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY est requis lorsque LLM_PROVIDER=claude.");
    }
    this.client = new Anthropic({ apiKey });
    this.model = config.get<string>("llmModel") ?? "claude-opus-5";
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 4096,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.system ? { system: request.system } : {}),
        ...(request.tools?.length
          ? {
              tools: request.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
              })),
            }
          : {}),
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      const toolCalls: LlmToolCall[] = response.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
        .map((block) => ({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        }));

      return {
        text,
        toolCalls,
        provider: this.name,
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      // On ne laisse pas fuiter l'erreur du fournisseur vers le client :
      // elle peut contenir des fragments de prompt, donc de données utilisateur.
      this.logger.error("Échec de l'appel Claude", error instanceof Error ? error.stack : error);
      throw new ServiceUnavailableException("Le moteur IA est momentanément indisponible.");
    }
  }

  async *stream(request: LlmCompletionRequest): AsyncIterable<LlmStreamChunk> {
    let text = "";
    const toolCalls: LlmToolCall[] = [];
    let model = this.model;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: request.maxTokens ?? 4096,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.system ? { system: request.system } : {}),
        ...(request.tools?.length
          ? {
              tools: request.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
              })),
            }
          : {}),
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          text += event.delta.text;
          yield { type: "text", text: event.delta.text };
        }
      }

      // Les blocs `tool_use` ne sont complets qu'une fois le flux terminé :
      // on les émet à la fin plutôt que d'assembler le JSON partiel nous-mêmes.
      const final = await stream.finalMessage();
      model = final.model;
      inputTokens = final.usage.input_tokens;
      outputTokens = final.usage.output_tokens;

      for (const block of final.content) {
        if (block.type === "tool_use") {
          const toolCall: LlmToolCall = {
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          };
          toolCalls.push(toolCall);
          yield { type: "tool_call", toolCall };
        }
      }
    } catch (error) {
      this.logger.error("Échec du flux Claude", error instanceof Error ? error.stack : error);
      throw new ServiceUnavailableException("Le moteur IA est momentanément indisponible.");
    }

    yield {
      type: "done",
      response: {
        text,
        toolCalls,
        provider: this.name,
        model,
        usage: { inputTokens, outputTokens },
      },
    };
  }
}
