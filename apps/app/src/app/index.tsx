import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";
import { useProfile } from "@/shared/hooks/use-profile";
import { useTheme } from "@/shared/providers/theme-provider";

/**
 * Point d'entrée : la conversation est l'écran d'accueil, comme sur la maquette.
 *
 * Y compris juste après l'inscription : l'accueil du canal permanent (§6.3,
 * A.13) se découvre comme n'importe quel nouveau message, pastille de non-lu
 * à l'appui (A.10), plutôt que par une navigation forcée qui en ferait un
 * parcours à part.
 */
export default function Index() {
  const { palette } = useTheme();
  const { isPending } = useProfile();

  if (isPending) {
    return (
      <View style={[styles.root, { backgroundColor: palette.background }]}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  return <Redirect href="/(app)/chat" />;
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
});
