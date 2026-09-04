import "../../global.css";

import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { configureReanimatedLogger, ReanimatedLogLevel } from "react-native-reanimated";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PortalHost } from "@rn-primitives/portal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DEFAULT_ACCENT } from "@jc/design";
import { useProfile } from "@/shared/hooks/use-profile";
import { AuthProvider, useAuth } from "@/shared/providers/auth-provider";
import { ThemeProvider, useTheme } from "@/shared/providers/theme-provider";

// NativeWind (`react-native-css-interop`) lit des shared values Reanimated en
// interne pour ses classes `hover:`/`active:` — le mode strict de Reanimated
// prend cette lecture pour un mésusage applicatif et log un faux positif à
// chaque rendu. Aucun écran n'appelle `useSharedValue` en dehors de ce
// fournisseur : désactiver le mode strict n'éteint donc que ce faux positif.
configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Le réseau mobile est intermittent : on sert le cache immédiatement
      // et on revalide en arrière-plan plutôt que d'afficher un écran vide.
      staleTime: 30_000,
      retry: 2,
    },
  },
});

/**
 * Redirige selon l'état d'authentification.
 *
 * Placé dans un composant enfant des providers : les hooks `useAuth` et
 * `useSegments` doivent s'exécuter sous le contexte, pas au-dessus.
 */
function AuthGate() {
  const { session, isLoading } = useAuth();
  const { palette } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthFlow = segments[0] === "(auth)";

    if (!session && !inAuthFlow) {
      router.replace("/(auth)/sign-in");
    } else if (session && inAuthFlow) {
      router.replace("/");
    }
  }, [session, isLoading, segments, router]);

  return (
    <View style={styles.root}>
      {/* `Slot` est monté en permanence, y compris pendant la relecture de la
          session : le remplacer par un écran d'attente démonterait le
          navigateur, et la redirection ci-dessus s'exécuterait avant qu'il ne
          soit remonté. Le voile évite pour autant de laisser entrevoir un
          écran dont on ignore encore s'il est autorisé. */}
      <Slot />
      {isLoading ? (
        <View
          style={[styles.splash, { backgroundColor: palette.background }]}
          accessibilityLabel="Chargement de votre session"
        >
          <ActivityIndicator color={palette.accent} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Alimente le thème avec les préférences enregistrées dans les réglages.
 *
 * Sous `AuthProvider` : elles sont servies par l'API, donc illisibles tant que
 * la session n'est pas rétablie. Tant qu'elles ne le sont pas, on suit le
 * réglage du système et la couleur par défaut — c'est ce qui ressemble le plus
 * au choix probable de l'utilisateur.
 */
function ThemedRoot({ children }: { children: ReactNode }) {
  const { data: profile } = useProfile();

  return (
    <ThemeProvider
      preference={profile?.preferences.theme ?? "system"}
      accent={profile?.preferences.assistantColor ?? DEFAULT_ACCENT}
    >
      {children}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemedRoot>
            <StatusBar style="auto" />
            <AuthGate />
            {/* Point de sortie des fenêtres modales. Placé *dans*
                `ThemeProvider` et non au-dessus : le fournisseur pose les
                variables de couleur sur la vue qui enveloppe ses enfants, et
                une fenêtre rendue en dehors s'afficherait sans palette. */}
            <PortalHost />
          </ThemedRoot>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
