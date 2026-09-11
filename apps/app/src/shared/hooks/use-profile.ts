import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_ASSISTANT_NAME, type UpdateUserProfile, type UserProfile } from "@jc/domain";
import { api } from "@/shared/lib/api";
import { supabase } from "@/shared/lib/supabase";
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

/**
 * Aligne le fuseau enregistré sur celui de l'appareil.
 *
 * Le serveur date dans le fuseau du profil : c'est là qu'il décide si une
 * échéance est déjà passée, et c'est dans cette horloge qu'il rend les dates au
 * modèle. Faute d'écran pour le régler — et il n'en faut pas, §13.4.4 —, il
 * valait « Europe/Paris » pour tout le monde, et un appareil ailleurs voyait
 * ses journées glisser d'un cran.
 *
 * Une seule tentative par session : un serveur qui refuse la valeur ne doit pas
 * être rappelé à chaque rendu.
 */
export function useSyncDeviceTimezone(): void {
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const attempted = useRef(false);

  const stored = profile?.preferences.timezone;

  useEffect(() => {
    if (stored === undefined || attempted.current) return;
    attempted.current = true;

    const device = deviceTimezone();
    if (device === null || device === stored) return;

    updateProfile.mutate({ timezone: device });
  }, [stored, updateProfile]);
}

/** `null` quand le moteur n'expose pas `Intl` — Hermes n'en embarque pas toujours. */
function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
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
 * Supprime le compte et toutes ses données (§8, §13.4.6). Irréversible.
 *
 * Déconnexion locale seulement : le compte n'existe déjà plus côté serveur
 * une fois la mutation résolue, un `signOut()` de portée globale tenterait en
 * vain de révoquer auprès de Supabase une session dont l'utilisateur a
 * disparu. Vider le cache évite qu'un profil ou des conversations déjà
 * supprimés ne s'affichent brièvement à la prochaine connexion sur cet
 * appareil.
 */
export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.me.deleteAccount(),
    onSuccess: async () => {
      queryClient.clear();
      await supabase.auth.signOut({ scope: "local" });
    },
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
