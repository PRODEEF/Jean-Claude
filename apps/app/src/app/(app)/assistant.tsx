import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { MessageSquarePlus } from "lucide-react-native";
import { fontSize, MIN_TOUCH_TARGET, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { api } from "@/shared/lib/api";
import { ConversationThread } from "@/features/conversation/ConversationThread";
import { FeedbackDialog } from "@/features/feedback/FeedbackDialog";
import { ScreenShell } from "@/shared/ui/screen-shell";
import { useAssistantName, useCompleteOnboarding, useProfile } from "@/shared/hooks/use-profile";
import { useTheme } from "@/shared/providers/theme-provider";

/**
 * Canal permanent Jean-Claude (A.10).
 *
 * Même fil et même bandeau de tête que les conversations classiques — c'est la
 * même interaction, et un en-tête à part la ferait passer pour un autre écran.
 * Ce qui le distingue est le périmètre des réponses : rappels, organisation de
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // Le canal est créé à la volée au premier accès, côté serveur.
  const channel = useQuery({
    queryKey: ["conversation", "assistant"],
    queryFn: () => api.conversations.assistantChannel(),
  });

  const onboarding = profile?.onboardingCompletedAt === null;

  return (
    <ScreenShell
      title={assistantName}
      // L'accueil doit rester sautable (§6.3) : la sortie est visible dès le
      // premier écran, pas cachée derrière un menu. En texte discret et non
      // en bouton plein — c'est une échappatoire, pas l'action principale.
      action={
        <View style={styles.actions}>
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

          <Pressable
            onPress={() => setFeedbackOpen(true)}
            hitSlop={8}
            style={styles.feedbackButton}
            accessibilityRole="button"
            accessibilityLabel="Donner votre avis"
          >
            <MessageSquarePlus size={20} color={palette.textMuted} />
          </Pressable>
        </View>
      }
      scrolls={false}
    >
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

      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  skip: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  skipLabel: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm, textDecorationLine: "underline" },
  // 28 pt + 8 pt de `hitSlop` : la zone touchable atteint les 44 pt de
  // `MIN_TOUCH_TARGET` sans grossir l'icône, comme dans MessageRow.
  feedbackButton: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  error: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm, textAlign: "center" },
});
