import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, spacing } from "@jc/design";
import { api } from "@/shared/lib/api";
import { ConversationThread } from "@/features/conversation/ConversationThread";
import { useAssistantName, useCompleteOnboarding, useProfile } from "@/shared/hooks/use-profile";
import { useTheme } from "@/shared/providers/theme-provider";

/**
 * Canal permanent Jean-Claude (A.10).
 *
 * Même fil que les conversations classiques — c'est la même interaction. Ce
 * qui le distingue est le périmètre des réponses : rappels, organisation de
 * l'outil, structure du projet. Ce bornage est appliqué côté serveur
 * (`buildSystemPrompt`), pas ici : c'est une règle métier, elle doit valoir
 * identiquement sur les quatre plateformes.
 *
 * C'est aussi ici que se déroule la conversation d'accueil qui suit
 * l'inscription (§6.3, A.13) : l'assistant y pose ses premières questions, et
 * l'écran n'en porte que la sortie de secours.
 */
export default function AssistantScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const assistantName = useAssistantName();
  const { data: profile } = useProfile();
  const completeOnboarding = useCompleteOnboarding();

  // Le canal est créé à la volée au premier accès, côté serveur.
  const channel = useQuery({
    queryKey: ["conversation", "assistant"],
    queryFn: () => api.conversations.assistantChannel(),
  });

  const onboarding = profile?.onboardingCompletedAt === null;

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: palette.text }]}>{assistantName}</Text>
            <Text style={[styles.subtitle, { color: palette.textMuted }]}>
              {onboarding
                ? "Faisons connaissance — quelques questions, puis on s'y met."
                : "Rappels, organisation et structure de votre espace."}
            </Text>
          </View>

          {/* L'accueil doit rester sautable (§6.3) : la sortie est visible dès
              le premier écran, pas cachée derrière un menu. En texte discret et
              non en bouton plein — c'est une échappatoire, pas l'action
              principale de l'écran. */}
          {onboarding ? (
            <Pressable
              onPress={() => {
                completeOnboarding.mutate(undefined, {
                  onSuccess: () => router.replace("/chat"),
                });
              }}
              disabled={completeOnboarding.isPending}
              hitSlop={8}
              style={styles.skip}
              accessibilityRole="button"
              accessibilityLabel="Passer les questions d'accueil"
            >
              <Text style={[styles.skipLabel, { color: palette.textMuted }]}>Passer</Text>
            </Pressable>
          ) : null}
        </View>
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
    borderBottomWidth: 1,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headerText: { flex: 1, gap: spacing.xs },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  subtitle: { fontSize: fontSize.sm },
  skip: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  skipLabel: { fontSize: fontSize.sm, textDecorationLine: "underline" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  error: { fontSize: fontSize.sm, textAlign: "center" },
});
