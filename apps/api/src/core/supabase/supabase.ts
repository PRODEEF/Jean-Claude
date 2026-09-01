import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { config } from "../config.js";
import type { Database } from "./database.types.js";

/**
 * Accès Postgres via Supabase.
 *
 * Trois usages distincts, à ne pas confondre : les Repositories passent par
 * `forUser()` pour que les RLS s'appliquent, `admin` les contourne et reste
 * réservé aux traitements système.
 */

const CLIENT_OPTIONS = { auth: { persistSession: false, autoRefreshToken: false } };

const anon = createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, CLIENT_OPTIONS);

/**
 * Client admin — contourne les RLS.
 *
 * Réservé aux traitements système : balayage des rappels du matin (A.10),
 * expansion des événements récurrents (A.11). Jamais dans un Repository appelé
 * depuis une requête HTTP.
 */
export const admin = createClient<Database>(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  CLIENT_OPTIONS,
);

/** Client scopé au JWT — RLS appliquées. À utiliser dans les Repositories. */
export function forUser(accessToken: string): SupabaseClient<Database> {
  return createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    ...CLIENT_OPTIONS,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Validation d'un access token — utilisée par le middleware d'authentification. */
export async function getUser(accessToken: string): Promise<User | null> {
  const { data, error } = await anon.auth.getUser(accessToken);
  if (error) return null;
  return data.user;
}
