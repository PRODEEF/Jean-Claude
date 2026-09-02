import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";
import { useProfile } from "@/shared/hooks/use-profile";
import { useTheme } from "@/shared/providers/theme-provider";

/**
 * Point d'entrée : la conversation est l'écran d'accueil, comme sur la maquette.
 *
 * Sauf juste après l'inscription — l'utilisateur est alors emmené vers le canal
 * permanent, où l'assistant l'accueille par quelques questions plutôt que de le
 * déposer devant un fil vide (§6.3, A.13). Le canal, et non un écran dédié :
 * l'accueil est une conversation, avec les mêmes gestes et les mêmes
 * propositions que le reste de l'application.
 */
export default function Index() {
  const { palette } = useTheme();
  const { data: profile, isPending } = useProfile();

  // Trancher sans le profil enverrait tout le monde vers la conversation, y
  // compris celui qui vient de s'inscrire : la redirection ne se rejoue pas.
  if (isPending) {
    return (
      <View style={[styles.root, { backgroundColor: palette.background }]}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  if (profile && profile.onboardingCompletedAt === null) {
    return <Redirect href="/(app)/assistant" />;
  }

  return <Redirect href="/(app)/chat" />;
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
});
