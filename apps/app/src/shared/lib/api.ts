import { fetch as streamingFetch } from "expo/fetch";
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
  /**
   * Le `fetch` global de React Native ne donne accès au corps qu'une fois la
   * réponse entière reçue : la réponse de l'assistant arriverait d'un bloc.
   * Celui d'`expo/fetch` expose un vrai `ReadableStream` sur iOS et Android,
   * et délègue au navigateur sur web — même code pour les trois cibles.
   */
  fetchImpl: streamingFetch as unknown as typeof fetch,
});
