import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SupabaseService } from "./supabase.service";

/** Global : tous les Repositories en dépendent, l'importer partout serait du bruit. */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
