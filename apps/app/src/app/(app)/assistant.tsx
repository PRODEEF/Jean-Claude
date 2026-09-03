import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { fontSize, MIN_TOUCH_TARGET, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { api } from "@/shared/lib/api";
import { ConversationThread } from "@/features/conversation/ConversationThread";
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
        onboarding ? (
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
        ) : null
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
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  skip: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  skipLabel: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm, textDecorationLine: "underline" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  error: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm, textAlign: "center" },
});
