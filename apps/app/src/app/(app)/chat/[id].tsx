import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, spacing } from "@jc/design";
import { api } from "@/shared/lib/api";
import { ConversationThread } from "@/features/conversation/ConversationThread";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useTheme } from "@/shared/providers/theme-provider";

/** Fil d'une conversation classique. */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const breakpoint = useBreakpoint();
  const router = useRouter();

  const conversation = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api.conversations.get(id),
  });

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        {/* Le retour n'a de sens que lorsque la barre latérale est escamotée :
            au-delà du point de rupture, elle reste visible à gauche et le lien
            ferait double emploi. */}
        {breakpoint === "compact" ? (
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Revenir à la liste des conversations"
            style={styles.back}
          >
            <Text style={[styles.backLabel, { color: palette.accent }]}>Conversations</Text>
          </Pressable>
        ) : null}
        <Text numberOfLines={1} style={[styles.title, { color: palette.text }]}>
          {conversation.data?.title ?? ""}
        </Text>
      </View>

      <ConversationThread conversationId={id} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
  },
  back: { minHeight: MIN_TOUCH_TARGET, justifyContent: "center" },
  backLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
});
