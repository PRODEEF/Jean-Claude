import { Pressable, StyleSheet, Text } from "react-native";
import { fontSize, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { useAuth } from "@/shared/providers/auth-provider";
import { useTheme } from "@/shared/providers/theme-provider";
import { NotBuiltYet, ScreenScaffold } from "@/shared/ui/screen-scaffold";

export default function SettingsScreen() {
  const { palette } = useTheme();
  const { signOut } = useAuth();

  return (
    <ScreenScaffold title="Réglages" subtitle="Personnalisez Jean-Claude.">
      <NotBuiltYet
        phase="Phase B"
        items={[
          "Nom et couleur de l'assistant",
          "Thème clair / sombre / système",
          "Périmètre du mode assistant — rappels, rangement, suggestions (A.10)",
          "Lecture à voix haute des réponses (§12.3)",
        ]}
      />

      <Pressable
        style={({ pressed }) => [
          styles.signOut,
          { borderColor: palette.border, opacity: pressed ? 0.7 : 1 },
        ]}
        onPress={() => void signOut()}
        accessibilityRole="button"
      >
        <Text style={[styles.signOutLabel, { color: palette.danger }]}>Se déconnecter</Text>
      </Pressable>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  signOut: {
    marginTop: spacing.xl,
    height: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutLabel: { fontSize: fontSize.md },
});
