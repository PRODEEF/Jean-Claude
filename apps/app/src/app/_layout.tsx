import "../../global.css";

import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PortalHost } from "@rn-primitives/portal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/shared/providers/auth-provider";
import { ThemeProvider, useTheme } from "@/shared/providers/theme-provider";

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

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <StatusBar style="auto" />
            <AuthGate />
            {/* Point de sortie des fenêtres modales. Placé *dans*
                `ThemeProvider` et non au-dessus : le fournisseur pose les
                variables de couleur sur la vue qui enveloppe ses enfants, et
                une fenêtre rendue en dehors s'afficherait sans palette. */}
            <PortalHost />
          </ThemeProvider>
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
