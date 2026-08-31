import { useMemo } from "react";
import { useAuth } from "@/shared/providers/auth-provider";

export type CurrentUser = {
  email: string;
  /** Nom complet si connu, sinon la partie locale de l'e-mail. */
  displayName: string;
  /** Prénom seul, pour les formules d'accueil. */
  firstName: string;
  /** Deux lettres au plus : au-delà, la pastille devient illisible. */
  initials: string;
};

/**
 * Identité de l'utilisateur connecté, telle qu'on l'affiche.
 *
 * Centralisé parce que la bannière, le profil et l'écran d'accueil montrent
 * la même personne : dérivée séparément, la même adresse produisait déjà des
 * initiales différentes d'un écran à l'autre.
 */
export function useCurrentUser(): CurrentUser {
  const { session } = useAuth();

  return useMemo(() => {
    const email = session?.user.email ?? "";

    // `user_metadata` est typé `any` par le SDK Supabase : on ne fait
    // confiance à `full_name` qu'après vérification du type.
    const metadata = session?.user.user_metadata as { full_name?: unknown } | undefined;
    const fullName = typeof metadata?.full_name === "string" ? metadata.full_name.trim() : "";

    const displayName = fullName || email.split("@")[0] || "Mon compte";
    const parts = displayName.split(/[\s._-]+/).filter(Boolean);

    return {
      email,
      displayName,
      firstName: parts[0] ?? "",
      initials:
        parts
          .slice(0, 2)
          .map((part) => part.charAt(0))
          .join("")
          .toUpperCase() || "?",
    };
  }, [session]);
}
