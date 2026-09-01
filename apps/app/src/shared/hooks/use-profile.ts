import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateUserProfile, UserProfile } from "@jc/domain";
import { api } from "@/shared/lib/api";
import { useAuth } from "@/shared/providers/auth-provider";

const PROFILE_KEY = ["profile"] as const;

/**
 * Profil et préférences de l'utilisateur connecté.
 *
 * Placé dans `shared/` et non dans la feature Réglages : le thème est appliqué
 * par la racine de l'application et le pseudo est affiché par la bannière, bien
 * avant qu'on n'ouvre les réglages.
 */
export function useProfile() {
  const { session } = useAuth();

  return useQuery({
    queryKey: PROFILE_KEY,
    queryFn: () => api.me.profile(),
    enabled: Boolean(session),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: UpdateUserProfile) => api.me.update(patch),
    // Le serveur renvoie le profil à jour : l'écrire directement dans le cache
    // applique le thème sans attendre l'aller-retour d'une invalidation.
    onSuccess: (profile: UserProfile) => queryClient.setQueryData(PROFILE_KEY, profile),
  });
}
