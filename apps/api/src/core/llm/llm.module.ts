import { Global, Logger, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LLM_PROVIDER, type LlmProvider } from "./llm.port";
import { GatewayProvider } from "./providers/gateway.provider";

/**
 * Point de branchement unique des moteurs IA (§5.1).
 *
 * Pour **changer de modèle** — Claude, Mistral, DeepSeek, Qwen — il n'y a rien
 * à écrire ici : Vercel AI Gateway les expose tous derrière la même clé, et
 * `LLM_MODEL=mistral/mistral-large` suffit.
 *
 * Le `switch` ci-dessous ne sert donc qu'à un cas encore hypothétique : un
 * moteur *hors* Gateway (auto-hébergé, Ollama en local). Il est conservé parce
 * que c'est le point d'injection que le §5.1 impose de garder ouvert.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): LlmProvider => {
        const name = config.get<string>("llmProvider") ?? "gateway";

        switch (name) {
          case "gateway":
            return new GatewayProvider(config);

          default:
            // Échec au démarrage plutôt qu'un repli silencieux : un
            // `LLM_PROVIDER` mal orthographié en production doit se voir
            // immédiatement, pas se traduire par une facturation inattendue
            // chez un autre fournisseur.
            throw new Error(`LLM_PROVIDER inconnu : "${name}". Valeurs supportées : gateway.`);
        }
      },
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {
  constructor(config: ConfigService) {
    Logger.log(
      `Moteur IA actif : ${config.get<string>("llmModel")} via ${config.get<string>("llmProvider")}`,
      LlmModule.name,
    );
  }
}
