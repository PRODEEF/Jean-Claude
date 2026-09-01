import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import type { Conversation, Message } from "@jc/domain";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { useTheme } from "@/shared/providers/theme-provider";
import { useConversationThread } from "./hooks/use-conversation-thread";
import { useSuggestions } from "./hooks/use-suggestions";
import { SuggestionCard } from "./SuggestionCard";

export type ConversationThreadProps = {
  conversationId: string;
  /**
   * Message à envoyer dès l'ouverture. Renseigné quand le canal permanent a
   * basculé la demande ici (A.10) : l'utilisateur n'a pas à la retaper.
   */
  initialDraft?: string | undefined;
};

/**
 * Fil de conversation : historique et saisie.
 *
 * Sert aussi bien une conversation classique que le canal permanent Jean-Claude
 * (A.10) — c'est la même donnée et la même interaction ; seul le périmètre des
 * réponses change, et il est borné côté serveur.
 *
 * N'utilise pas `ScreenScaffold` : celui-ci enveloppe son contenu dans un
 * `ScrollView`, et une `FlatList` imbriquée dans un `ScrollView` perd la
 * virtualisation.
 */
export function ConversationThread({ conversationId, initialDraft }: ConversationThreadProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<Message>>(null);

  // La question voyage jusqu'au nouveau fil, qui s'en charge à l'ouverture :
  // c'est ce qui permet de réutiliser le tour de dialogue ordinaire, réponse
  // en flux comprise, plutôt que d'inventer un second chemin.
  const goToNewConversation = useCallback(
    (conversation: Conversation, content: string) => {
      router.push({ pathname: "/chat/[id]", params: { id: conversation.id, draft: content } });
    },
    [router],
  );

  const { messages, send, submit, streamingText } = useConversationThread(
    conversationId,
    goToNewConversation,
  );
  const { suggestions, resolve } = useSuggestions(conversationId);

  const pending = suggestions.data ?? [];
  const failure = messages.error ?? send.error ?? resolve.error;

  // `useRef` et non l'état d'envoi : revenir sur ce fil ne doit pas renvoyer la
  // question une seconde fois, alors que le paramètre de route est toujours là.
  const autoSent = useRef(false);
  useEffect(() => {
    if (!initialDraft || autoSent.current) return;
    autoSent.current = true;
    submit(initialDraft);
  }, [initialDraft, submit]);

  const sendDraft = useCallback(() => {
    const content = draft.trim();
    if (!content || send.isPending) return;
    setDraft("");
    submit(content);
  }, [draft, send.isPending, submit]);

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isUser = item.role === "user";
      return (
        <View
          style={[
            styles.bubble,
            isUser
              ? { alignSelf: "flex-end", backgroundColor: palette.accent }
              : {
                  alignSelf: "flex-start",
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                  borderWidth: 1,
                },
          ]}
        >
          <Text style={[styles.bubbleText, { color: isUser ? palette.accentText : palette.text }]}>
            {item.content}
          </Text>
        </View>
      );
    },
    [palette],
  );

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: palette.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {messages.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={palette.accent} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages.data?.items ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={[styles.empty, { color: palette.textMuted }]}>
              Écrivez ce que vous avez en tête. Le rangement viendra ensuite.
            </Text>
          }
          // Rendu `null` quand il n'y a rien à montrer : un pied vide compterait
          // malgré tout dans l'espacement de la liste.
          ListFooterComponent={
            streamingText === null && pending.length === 0 ? null : (
              <View style={styles.footer}>
                {streamingText === null ? null : (
                  <View
                    style={[
                      styles.bubble,
                      styles.pending,
                      { backgroundColor: palette.surface, borderColor: palette.border },
                    ]}
                  >
                    {/* Tant qu'aucun jeton n'est arrivé, la barre d'attente dit
                        que la demande est partie ; ensuite le texte parle de
                        lui-même. */}
                    {streamingText.length === 0 ? (
                      <ActivityIndicator color={palette.textMuted} />
                    ) : (
                      <Text style={[styles.bubbleText, { color: palette.text }]}>
                        {streamingText}
                      </Text>
                    )}
                  </View>
                )}

                {/* L'assistant propose, il n'exécute pas : les dossiers ne sont
                    créés que si l'utilisateur touche « Créer » (§12.1). */}
                {pending.map((suggestion) => (
                  <SuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    isPending={resolve.isPending && resolve.variables?.id === suggestion.id}
                    onAccept={() => resolve.mutate({ id: suggestion.id, action: "accept" })}
                    onDismiss={() => resolve.mutate({ id: suggestion.id, action: "dismiss" })}
                  />
                ))}
              </View>
            )
          }
        />
      )}

      {failure ? (
        <View style={[styles.errorBar, { borderColor: palette.border }]}>
          <Text style={[styles.errorText, { color: palette.danger }]}>{errorMessage(failure)}</Text>
          {/* Un échec de chargement se rejoue ; un échec d'envoi, non — le
              message est déjà enregistré et l'API n'offre pas de relancer le
              modèle seul. Proposer « Réessayer » dans ce cas mentirait. Une
              proposition refusée par le serveur se rejoue depuis sa carte. */}
          <Pressable
            onPress={() => {
              if (messages.error) {
                void messages.refetch();
                return;
              }
              send.reset();
              resolve.reset();
            }}
            accessibilityRole="button"
            style={styles.retry}
          >
            <Text style={[styles.retryText, { color: palette.accent }]}>
              {messages.error ? "Réessayer" : "Fermer"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View
        style={[
          styles.composer,
          {
            backgroundColor: palette.surfaceElevated,
            borderTopColor: palette.border,
            paddingBottom: spacing.md + insets.bottom,
          },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Votre message"
          placeholderTextColor={palette.textMuted}
          multiline
          onSubmitEditing={sendDraft}
          // `submit` sur web envoie avec Entrée ; sur mobile le clavier garde
          // un retour à la ligne, la saisie multiligne y étant la norme.
          blurOnSubmit={Platform.OS === "web"}
          accessibilityLabel="Votre message"
          style={[
            styles.input,
            { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        />
        <Pressable
          onPress={sendDraft}
          disabled={draft.trim().length === 0 || send.isPending}
          accessibilityRole="button"
          accessibilityLabel="Envoyer le message"
          style={[
            styles.sendButton,
            {
              backgroundColor: palette.accent,
              opacity: draft.trim().length === 0 || send.isPending ? 0.4 : 1,
            },
          ]}
        >
          <Text style={[styles.sendLabel, { color: palette.accentText }]}>Envoyer</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Une erreur est survenue.";
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
  },
  bubble: {
    maxWidth: "85%",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  footer: { gap: spacing.md },
  pending: { alignSelf: "flex-start", borderWidth: 1 },
  bubbleText: { fontSize: fontSize.md, lineHeight: 22 },
  empty: { fontSize: fontSize.sm, textAlign: "center", marginTop: spacing.xxl },
  errorBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
  },
  errorText: { fontSize: fontSize.sm, flexShrink: 1 },
  retry: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  retryText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
  },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    maxHeight: 140,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    fontSize: fontSize.md,
  },
  sendButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  sendLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
