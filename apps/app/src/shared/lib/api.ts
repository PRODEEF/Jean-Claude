import { JeanClaudeClient } from "@jc/api-client";
import { env } from "./env";
import { supabase } from "./supabase";

/**
 * Instance unique du client d'API.
 *
 * Le jeton est relu à chaque requête auprès de Supabase plutôt que capturé
 * une fois : le SDK le renouvelle en arrière-plan, et une copie figée
 * expirerait au bout d'une heure.
 */
export const api = new JeanClaudeClient({
  baseUrl: env.apiUrl,
  getAccessToken: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
  onUnauthorized: () => {
    void supabase.auth.signOut();
  },
});
