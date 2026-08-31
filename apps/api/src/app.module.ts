import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import configuration from "./core/config/configuration";
import { AuthModule } from "./core/auth/auth.module";
import { LlmModule } from "./core/llm/llm.module";
import { SupabaseModule } from "./core/supabase/supabase.module";
import { ConversationModule } from "./domain/conversation/conversation.module";
import { FolderModule } from "./domain/folder/folder.module";
import { HealthModule } from "./feature/health/health.module";

/**
 * Racine de l'API.
 *
 * Trois couches, dans cet ordre :
 *   core/    — infrastructure transverse (config, base, auth, moteur IA)
 *   domain/  — entités métier, une par module : dossiers, conversations...
 *   feature/ — cas d'usage transverses qui composent plusieurs domaines
 *              (assistant proactif, recherche, export)
 *
 * Un module `domain/` ne dépend jamais d'un module `feature/` ; l'inverse est
 * la règle. C'est ce qui garde le métier réutilisable côté web comme mobile.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], cache: true }),
    SupabaseModule,
    AuthModule,
    LlmModule,

    FolderModule,
    ConversationModule,

    HealthModule,
  ],
})
export class AppModule {}
