import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fontSize, fontWeight, spacing } from "@jc/design";
import { api } from "@/shared/lib/api";
import { ConversationThread } from "@/features/conversation/ConversationThread";
import { useTheme } from "@/shared/providers/theme-provider";

/**
 * Canal permanent Jean-Claude (A.10).
 *
 * Même fil que les conversations classiques — c'est la même interaction. Ce
 * qui le distingue est le périmètre des réponses : rappels, organisation de
 * l'outil, structure du projet. Ce bornage est appliqué côté serveur
 * (`buildSystemPrompt`), pas ici : c'est une règle métier, elle doit valoir
 * identiquement sur les quatre plateformes.
 */
export default function AssistantScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  // Le canal est créé à la volée au premier accès, côté serveur.
  const channel = useQuery({
    queryKey: ["conversation", "assistant"],
    queryFn: () => api.conversations.assistantChannel(),
  });

  return (
    <View style={[styles.root, { backgroundColor: palette.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <Text style={[styles.title, { color: palette.text }]}>Jean-Claude</Text>
        <Text style={[styles.subtitle, { color: palette.textMuted }]}>
          Rappels, organisation et structure de votre espace.
        </Text>
      </View>

      {channel.data ? (
        <ConversationThread conversationId={channel.data.id} />
      ) : (
        <View style={styles.centered}>
          {channel.error ? (
            <Text style={[styles.error, { color: palette.danger }]}>
              {channel.error instanceof Error
                ? channel.error.message
                : "Canal indisponible pour le moment."}
            </Text>
          ) : (
            <ActivityIndicator color={palette.accent} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
    borderBottomWidth: 1,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
  },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  subtitle: { fontSize: fontSize.sm },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  error: { fontSize: fontSize.sm, textAlign: "center" },
});
