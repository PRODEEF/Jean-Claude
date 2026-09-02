import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MoreHorizontal } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { api } from "@/shared/lib/api";
import { ConversationDialog } from "@/features/conversation/ConversationDialog";
import { ConversationHeader } from "@/features/conversation/ConversationHeader";
import { ConversationThread } from "@/features/conversation/ConversationThread";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useTheme } from "@/shared/providers/theme-provider";

/** Fil d'une conversation classique. */
export default function ConversationScreen() {
  const { id, draft } = useLocalSearchParams<{ id: string; draft?: string }>();
  const { palette } = useTheme();
  const breakpoint = useBreakpoint();
  const router = useRouter();
  const [actionsOpen, setActionsOpen] = useState(false);

  const conversation = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api.conversations.get(id),
  });

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <ConversationHeader
        title={conversation.data?.title ?? ""}
        // Le retour n'a de sens que lorsque la barre latérale est escamotée :
        // au-delà du point de rupture, elle reste visible à gauche et le lien
        // ferait double emploi.
        onBack={breakpoint === "compact" ? () => router.back() : undefined}
        // Le « … » de la maquette. Il n'apparaît qu'une fois la conversation
        // chargée : sans elle, la fenêtre n'aurait ni titre ni rangement à
        // présenter.
        action={
          conversation.data ? (
            <Pressable
              onPress={() => setActionsOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Renommer, ranger ou supprimer la conversation"
              hitSlop={8}
              style={styles.actions}
            >
              <MoreHorizontal size={20} color={palette.textMuted} />
            </Pressable>
          ) : null
        }
      />

      <ConversationThread conversationId={id} initialDraft={draft} />

      <ConversationDialog
        conversation={actionsOpen ? (conversation.data ?? null) : null}
        onClose={() => setActionsOpen(false)}
        onDeleted={() => {
          setActionsOpen(false);
          // `replace` et non `push` : la conversation supprimée ne doit pas
          // rester dans l'historique de navigation.
          router.replace("/chat");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  actions: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
