import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_ASSISTANT_NAME, type UpdateUserProfile, type UserProfile } from "@jc/domain";
import { api } from "@/shared/lib/api";
import { useAuth } from "@/shared/providers/auth-provider";

export const PROFILE_KEY = ["profile"] as const;

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

/** Passe la conversation d'accueil (§6.3, A.13). */
export function useCompleteOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.me.completeOnboarding(),
    onSuccess: (profile: UserProfile) => queryClient.setQueryData(PROFILE_KEY, profile),
  });
}

/**
 * Nom sous lequel l'assistant se présente (§4.5).
 *
 * La bannière, la barre latérale et le canal permanent l'affichent tous les
 * trois : sans ce point unique, renommer l'assistant en laisserait un
 * l'appeler encore « Jean-Claude ». Le défaut est celui du serveur, pour que
 * le nom ne change pas au moment où le profil arrive.
 */
export function useAssistantName(): string {
  const { data } = useProfile();
  return data?.preferences.assistantName ?? DEFAULT_ASSISTANT_NAME;
}
