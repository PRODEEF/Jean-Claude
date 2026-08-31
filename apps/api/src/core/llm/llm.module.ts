import { Global, Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LLM_PROVIDER } from "./llm.port";
import { GatewayProvider } from "./providers/gateway.provider";

/**
 * Point de branchement du moteur IA (§5.1).
 *
 * Tout passe par Vercel AI Gateway, qui expose les éditeurs — Anthropic,
 * Mistral, DeepSeek, Qwen — derrière une clé unique. Changer de moteur ne
 * demande donc aucun code : `LLM_MODEL=mistral/mistral-large` suffit.
 *
 * Les services dépendent du symbole `LLM_PROVIDER`, jamais de la classe :
 * c'est ce qui les garde testables sans réseau, et ce qui permettrait de
 * substituer l'adaptateur si un moteur devait un jour être appelé hors
 * Gateway.
 */
@Global()
@Module({
  providers: [{ provide: LLM_PROVIDER, useClass: GatewayProvider }],
  exports: [LLM_PROVIDER],
})
export class LlmModule {
  constructor(config: ConfigService) {
    Logger.log(`Moteur IA actif : ${config.get<string>("llmModel")}`, LlmModule.name);
  }
}
