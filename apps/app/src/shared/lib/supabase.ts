import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import { tokenStorage } from "./token-storage";

/**
 * Client Supabase côté application.
 *
 * Il ne sert QUE à l'authentification (§6.1 : e-mail + code à usage unique).
 * Toutes les lectures et écritures métier passent par l'API du §5.3 — jamais
 * en direct depuis le client — pour que la logique de classement, de todolist
 * et de bornage de l'assistant reste en un seul endroit.
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: {
      getItem: tokenStorage.get,
      setItem: tokenStorage.set,
      removeItem: tokenStorage.remove,
    },
    autoRefreshToken: true,
    persistSession: true,
    // Le flux OTP ne repose pas sur une redirection : rien à détecter dans l'URL.
    detectSessionInUrl: false,
  },
});
