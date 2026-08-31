import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Accès Postgres via Supabase.
 *
 * Trois clients, trois usages distincts — la distinction est volontaire et
 * doit être respectée : les Repositories utilisent `forUser()` pour que les
 * RLS s'appliquent, `admin` est réservé aux tâches système (rappels planifiés
 * exécutés sans requête utilisateur).
 */
@Injectable()
export class SupabaseService {
  private readonly anonClient: SupabaseClient<Database>;
  private readonly adminClient: SupabaseClient<Database>;

  private readonly url: string;
  private readonly anonKey: string;

  constructor(private readonly config: ConfigService) {
    this.url = this.config.getOrThrow<string>("supabaseUrl");
    this.anonKey = this.config.getOrThrow<string>("supabaseAnonKey");
    const serviceKey = this.config.getOrThrow<string>("supabaseServiceRoleKey");

    this.anonClient = createClient<Database>(this.url, this.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.adminClient = createClient<Database>(this.url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /** Client scopé au JWT — RLS appliquées. À utiliser dans les Repositories. */
  forUser(accessToken: string): SupabaseClient<Database> {
    return createClient<Database>(this.url, this.anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /** Client anon, sans identité utilisateur. */
  get anon(): SupabaseClient<Database> {
    return this.anonClient;
  }

  /**
   * Client admin — contourne les RLS.
   * Réservé aux traitements système : balayage des rappels du matin (A.10),
   * expansion des événements récurrents (A.11). Jamais dans un Repository
   * appelé depuis une requête HTTP.
   */
  get admin(): SupabaseClient<Database> {
    return this.adminClient;
  }

  /** Validation d'un access token — utilisée par le guard d'authentification. */
  async getUser(accessToken: string): Promise<User | null> {
    const {
      data: { user },
      error,
    } = await this.anonClient.auth.getUser(accessToken);
    if (error || !user) return null;
    return user;
  }
}
