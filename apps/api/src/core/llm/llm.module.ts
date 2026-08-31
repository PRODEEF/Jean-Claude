import { Global, Logger, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LLM_PROVIDER, type LlmProvider } from "./llm.port";
import { ClaudeProvider } from "./providers/claude.provider";

/**
 * Point de branchement unique des moteurs IA (§5.1).
 *
 * Pour ajouter un fournisseur :
 *   1. écrire `providers/mistral.provider.ts` qui implémente `LlmProvider` ;
 *   2. ajouter une entrée dans le `switch` ci-dessous ;
 *   3. renseigner `LLM_PROVIDER=mistral` dans l'environnement.
 *
 * Aucun autre fichier n'est à modifier — c'est précisément ce que le cahier
 * des charges demande de garantir dès la Phase A.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): LlmProvider => {
        const name = config.get<string>("llmProvider") ?? "claude";

        switch (name) {
          case "claude":
            return new ClaudeProvider(config);

          // case "mistral":  return new MistralProvider(config);   // souverain (§5.1)
          // case "deepseek": return new DeepseekProvider(config);

          default:
            // Échec au démarrage plutôt qu'un repli silencieux : un
            // `LLM_PROVIDER` mal orthographié en production doit se voir
            // immédiatement, pas se traduire par une facturation inattendue
            // chez un autre fournisseur.
            throw new Error(
              `LLM_PROVIDER inconnu : "${name}". Valeurs supportées : claude.`,
            );
        }
      },
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {
  constructor(config: ConfigService) {
    Logger.log(
      `Moteur IA actif : ${config.get<string>("llmProvider")} (${config.get<string>("llmModel")})`,
      LlmModule.name,
    );
  }
}
