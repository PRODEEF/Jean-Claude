import { AppState, Platform } from "react-native";
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

/**
 * Le renouvellement automatique du jeton ne tourne qu'application au premier
 * plan.
 *
 * C'est ce que demande la documentation Supabase pour React Native : les
 * minuteurs d'un processus mis en veille par le système ne se déclenchent pas,
 * et sans reprise explicite au retour, la session est périmée alors que le SDK
 * se croit à jour — l'utilisateur est déconnecté au premier appel.
 *
 * Rien à faire sur web : un onglet garde ses minuteurs, et `AppState` n'y a
 * pas d'équivalent. Il ne s'agit pas ici d'un écart de taille d'écran mais
 * d'une capacité de plateforme, seul cas où le test est légitime.
 */
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
