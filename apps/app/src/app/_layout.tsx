import { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/shared/providers/auth-provider";
import { ThemeProvider } from "@/shared/providers/theme-provider";

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

  return <Slot />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <StatusBar style="auto" />
            <AuthGate />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
