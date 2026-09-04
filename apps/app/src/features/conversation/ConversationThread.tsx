import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { Conversation, Message, Suggestion } from "@jc/domain";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useTheme } from "@/shared/providers/theme-provider";
import { Markdown } from "@/shared/ui/Markdown";
import { contentColumn, READING_MAX_WIDTH } from "@/shared/ui/screen-shell";
import { Composer } from "./Composer";
import { useConversationThread } from "./hooks/use-conversation-thread";
import { useSuggestions } from "./hooks/use-suggestions";
import { MessageRow } from "./MessageRow";
import { QuestionCard } from "./QuestionCard";
import { ResolvedSuggestionNote, SuggestionCard } from "./SuggestionCard";
import { SwitchAsideCard } from "./SwitchAsideCard";
import { ThinkingIndicator } from "./ThinkingIndicator";

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
  // Le fil porte son propre défilement, mais suit la colonne des autres
  // écrans : sans cela, le shell et le fil borneraient chacun à leur façon.
  const column = contentColumn(useBreakpoint() === "compact", READING_MAX_WIDTH);
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<ThreadItem>>(null);
  const inputRef = useRef<TextInput>(null);
  // Question écartée d'un « Passer », retenue par identifiant de message : le
  // fil se recharge, la carte ne doit pas revenir pour autant.
  const [skippedQuestion, setSkippedQuestion] = useState<string | null>(null);

  // La question voyage jusqu'au nouveau fil, qui s'en charge à l'ouverture :
  // c'est ce qui permet de réutiliser le tour de dialogue ordinaire, réponse
  // en flux comprise, plutôt que d'inventer un second chemin.
  const goToDedicatedConversation = useCallback(
    (conversation: Conversation, content: string) => {
      router.push({ pathname: "/chat/[id]", params: { id: conversation.id, draft: content } });
    },
    [router],
  );

  // Le message n'a pas atteint le serveur : le rendre au champ plutôt que de
  // le laisser disparaître avec l'échec. Sans écraser ce que l'utilisateur a pu
  // retaper entre-temps.
  const restoreDraft = useCallback((content: string) => {
    setDraft((current) => (current.length > 0 ? current : content));
  }, []);

  const { messages, send, submit, edit, retry, stop, switchAside, streamingText, pendingUserText } =
    useConversationThread(conversationId, goToDedicatedConversation, restoreDraft);
  const { pending, resolved, resolve } = useSuggestions(conversationId);

  const failure = messages.error ?? send.error ?? resolve.error ?? switchAside.error;

  // Messages et propositions tranchées sont refondus en une seule suite,
  // ordonnée par date : ce que l'assistant a fait se relit au moment où il l'a
  // fait, pas empilé au bas du fil. Ce qui attend encore un geste reste en
  // pied de liste, là où l'utilisateur écrit.
  const items = useMemo(
    (): ThreadItem[] =>
      [
        ...(messages.data?.items ?? []).map((message): ThreadItem => ({ id: message.id, message })),
        ...resolved.map((suggestion): ThreadItem => ({ id: suggestion.id, suggestion })),
      ].sort((a, b) => itemDate(a) - itemDate(b)),
    [messages.data, resolved],
  );

  // Réponses proposées sous la dernière question de l'assistant, tant qu'elle
  // n'a pas reçu de réponse : un message plus récent, une réponse en cours de
  // frappe ou un « Passer » la referment.
  const question = useMemo(() => {
    const items = messages.data?.items ?? [];
    const last = items[items.length - 1];
    if (!last || last.role !== "assistant" || !last.choices || last.id === skippedQuestion) {
      return null;
    }
    return { id: last.id, text: last.content, choices: last.choices };
  }, [messages.data, skippedQuestion]);

  const askable = question !== null && streamingText === null && pendingUserText === null;

  // `useRef` et non l'état d'envoi : revenir sur ce fil ne doit pas renvoyer la
  // question une seconde fois, alors que le paramètre de route est toujours là.
  const autoSent = useRef(false);
  useEffect(() => {
    if (!initialDraft || autoSent.current) return;
    autoSent.current = true;
    submit(initialDraft);
  }, [initialDraft, submit]);

  // `onContentSizeChange` ne suffit pas pendant le flux : le pied de liste
  // grandit d'un jeton à la fois, et le rendu Markdown reflue après coup —
  // la liste mesure alors sa hauteur d'avant. Suivre `streamingText` la
  // recale à chaque arrivée de texte.
  useEffect(() => {
    if (streamingText === null && pendingUserText === null) return;
    listRef.current?.scrollToEnd({ animated: false });
  }, [streamingText, pendingUserText]);

  const sendDraft = useCallback(() => {
    const content = draft.trim();
    if (!content || send.isPending) return;
    setDraft("");
    submit(content);
  }, [draft, send.isPending, submit]);

  const renderItem = useCallback(
    ({ item, index }: { item: ThreadItem; index: number }) => {
      if (!item.message) return <ResolvedSuggestionNote suggestion={item.suggestion} />;

      const message = item.message;
      const previous = items[index - 1]?.message;

      return (
        <>
          <MessageRow
            message={message}
            answeredQuestion={answeredQuestion(message, previous)}
            onRetry={() => retry(message.id)}
            onEdit={(content) => edit(message.id, content)}
            busy={send.isPending}
          />

          {/* Le canal permanent propose, l'utilisateur valide (§12.1, A.10). La
              question restée sans réponse part avec lui : il n'a pas à la
              retaper dans le fil qui l'accueille. */}
          {message.redirectTitle !== null && message.redirectAcceptedAt === null ? (
            <SwitchAsideCard
              title={message.redirectTitle}
              isPending={switchAside.isPending}
              onSwitch={() =>
                switchAside.mutate({
                  messageId: message.id,
                  draft: previous?.role === "user" ? previous.content : "",
                })
              }
            />
          ) : null}
        </>
      );
    },
    [items, retry, edit, send.isPending, switchAside],
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
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, column]}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
          // En en-tête et non en état vide : la phrase reste au-dessus du fil
          // une fois les premiers messages échangés, au lieu de disparaître dès
          // le premier envoi — elle défile avec le reste, sans être fixée.
          ListHeaderComponent={
            <Text style={[styles.intro, { color: palette.textMuted }]}>
              Écrivez ce que vous avez en tête. Le rangement viendra ensuite.
            </Text>
          }
          // Rendu `null` quand il n'y a rien à montrer : un pied vide compterait
          // malgré tout dans l'espacement de la liste.
          ListFooterComponent={
            streamingText === null && pending.length === 0 && pendingUserText === null ? null : (
              <View style={styles.footer}>
                {/* Le message tel qu'il vient d'être tapé, en attendant que le
                    serveur renvoie sa version enregistrée. Même apparence que
                    les autres : rien ne doit signaler à l'utilisateur qu'il
                    regarde un état transitoire. */}
                {pendingUserText === null ? null : (
                  <View
                    style={[
                      styles.bubble,
                      { alignSelf: "flex-end", backgroundColor: palette.accentSoft },
                    ]}
                  >
                    <Text style={[styles.bubbleText, { color: palette.accentSoftText }]}>
                      {pendingUserText}
                    </Text>
                  </View>
                )}

                {streamingText === null ? null : (
                  <View style={[styles.bubble, styles.plain]}>
                    {/* Tant qu'aucun jeton n'est arrivé, le compteur dit que la
                        demande est partie et depuis combien de temps ; ensuite
                        le texte parle de lui-même. */}
                    {streamingText.length === 0 ? (
                      <ThinkingIndicator />
                    ) : (
                      <Markdown>{streamingText}</Markdown>
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
                    onAccept={(folderSelection) =>
                      resolve.mutate({
                        id: suggestion.id,
                        action: "accept",
                        ...(folderSelection ? { folderSelection } : {}),
                      })
                    }
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
              message est le plus souvent déjà enregistré, et l'API n'offre pas
              de relancer le modèle seul. Proposer « Réessayer » ici le
              dupliquerait. Quand rien n'a été enregistré, le texte est rendu au
              champ de saisie et l'utilisateur le renvoie lui-même. Une
              proposition refusée par le serveur se rejoue depuis sa carte. */}
          <Pressable
            onPress={() => {
              if (messages.error) {
                void messages.refetch();
                return;
              }
              send.reset();
              resolve.reset();
              switchAside.reset();
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

      {askable && question ? (
        <View style={[styles.question, column]}>
          <QuestionCard
            question={question.text}
            choices={question.choices}
            onChoose={(choice) => {
              setSkippedQuestion(question.id);
              submit(choice);
            }}
            onWrite={() => inputRef.current?.focus()}
            onSkip={() => setSkippedQuestion(question.id)}
          />
        </View>
      ) : null}

      <View style={[styles.composer, column, { paddingBottom: spacing.md + insets.bottom }]}>
        <Composer
          value={draft}
          onChangeText={setDraft}
          onSubmit={sendDraft}
          // Le libellé dit que la carte n'oblige à rien : on peut toujours
          // répondre à côté de ce qui est proposé.
          placeholder={askable ? "Ou répondre directement…" : "Votre message"}
          busy={send.isPending}
          onStop={stop}
          inputRef={inputRef}
        />

        {/* Sous le champ et non dans le fil : la mention vaut pour toutes les
            réponses, elle ne commente pas la dernière. C'est là que ChatGPT,
            Claude et Perplexity la posent (§4.2). */}
        <Text style={[styles.disclaimer, { color: palette.textMuted }]}>
          Jean-Claude comme tout non-humain peut faire des erreurs. Veuillez vérifier les réponses.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * Une entrée du fil : un message, ou la trace d'une proposition tranchée. La
 * seconde forme n'a pas de `message`, ce qui suffit à les distinguer.
 */
type ThreadItem =
  | { id: string; message: Message; suggestion?: undefined }
  | { id: string; message?: undefined; suggestion: Suggestion };

/**
 * La question à laquelle ce message répond, quand la réponse a été choisie
 * d'un appui sous une carte de questions.
 *
 * Reconstituée à l'affichage et non enregistrée : c'est bien la réponse seule
 * que l'utilisateur a envoyée, et la dupliquer en base ferait deux textes à
 * tenir cohérents. Relue plus haut dans le fil, « Oui » ne dirait plus à quoi
 * il répondait.
 */
function answeredQuestion(message: Message, previous: Message | undefined): string | null {
  if (message.role !== "user" || !previous || previous.role !== "assistant") return null;
  return previous.choices?.includes(message.content) ? previous.content : null;
}

function itemDate(item: ThreadItem): number {
  return new Date(item.message ? item.message.createdAt : item.suggestion.createdAt).getTime();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Une erreur est survenue.";
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.lg, gap: spacing.md },
  bubble: {
    maxWidth: "85%",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  footer: { gap: spacing.md },
  /**
   * Réponse de l'assistant : sans fond, elle n'a plus de raison d'être bornée
   * à 85 % ni d'être rentrée de son propre padding — elle se lit sur toute la
   * colonne, alignée sur les autres textes de l'écran.
   */
  plain: { alignSelf: "flex-start", maxWidth: "100%", paddingHorizontal: 0 },
  bubbleText: { fontFamily: FONT_FAMILY, fontSize: fontSize.md, lineHeight: 22 },
  intro: {
    fontFamily: FONT_FAMILY,
    fontSize: fontSize.sm,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  errorBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
  },
  errorText: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm, flexShrink: 1 },
  retry: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  retryText: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  question: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  composer: { padding: spacing.md },
  disclaimer: {
    fontFamily: FONT_FAMILY,
    fontSize: fontSize.xs,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
