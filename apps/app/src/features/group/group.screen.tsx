import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  type TextInput,
  View,
} from "react-native";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { Bell, BellOff, FolderInput, X } from "lucide-react-native";
import {
  DEFAULT_ASSISTANT_NAME,
  type GroupListSuggestion,
  type GroupMessage,
  type WorkspaceMember,
} from "@jc/domain";
import { useWorkspaceMembers } from "@/features/workspace/hooks/use-workspaces";
import { MessageRow } from "@/features/conversation/MessageRow";
import { useSpeech } from "@/features/conversation/hooks/use-speech";
import { Composer } from "@/features/conversation/Composer";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { markdownToSpeech } from "@/shared/lib/markdown";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MIN_TOUCH_TARGET, spacing } from "@jc/design";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useAuth } from "@/shared/providers/auth-provider";
import { useTheme } from "@/shared/providers/theme-provider";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { contentColumn, READING_MAX_WIDTH, ScreenShell } from "@/shared/ui/screen-shell";
import { Text } from "@/shared/ui/text";
import { GroupFoldersDialog } from "./GroupFoldersDialog";
import { GroupListSuggestionCard } from "./GroupListSuggestionCard";
import { useGroupTyping } from "./hooks/use-group-realtime";
import {
  useGroup,
  useGroupMessages,
  useGroupSuggestions,
  useMarkGroupRead,
  useSendGroupMessage,
  useSetGroupMuted,
} from "./hooks/use-groups";

/**
 * Fil d'une discussion de groupe.
 *
 * Volontairement plus simple que le fil personnel : ni flux de réponse, ni
 * suggestions, ni pièces jointes. Jean-Claude y répond comme un membre : sa
 * réponse arrive par Realtime, après coup (docs/COLLABORATION.md, lot 4).
 */
export function GroupScreen() {
  const { id: workspaceId, groupId } = useLocalSearchParams<{ id: string; groupId: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const compact = useBreakpoint() === "compact";
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const { session } = useAuth();
  const selfId = session?.user.id ?? null;
  // Dans un groupe, l'assistant est « Jean-Claude » pour tous : le nom choisi
  // dans les réglages est personnel, alors que le serveur nomme et reconnaît
  // Jean-Claude seul (mention, consigne, fil transmis au modèle).
  const assistantName = DEFAULT_ASSISTANT_NAME;

  const group = useGroup(groupId);
  const messages = useGroupMessages(groupId);
  const suggestions = useGroupSuggestions(groupId);
  const suggestionByMessage = useMemo(
    () => new Map((suggestions.data ?? []).map((suggestion) => [suggestion.messageId, suggestion])),
    [suggestions.data],
  );
  const members = useWorkspaceMembers(workspaceId);
  const markRead = useMarkGroupRead(groupId);
  const send = useSendGroupMessage(groupId);
  const setMuted = useSetGroupMuted(groupId);
  const muted = group.data?.aiMuted ?? false;
  const { speakingId, toggle: toggleSpeech } = useSpeech();
  const { typingUserIds, notifyTyping, clearTyping } = useGroupTyping(groupId);
  const [draft, setDraft] = useState("");
  const [filing, setFiling] = useState(false);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const listRef = useRef<FlatList<GroupMessage>>(null);
  const inputRef = useRef<TextInput>(null);
  // Relances d'un appui sur une citation. Chacune peut échouer à son tour et
  // rappeler le gestionnaire d'échec : sans borne, le fil défilait sans fin.
  const scrollRetries = useRef(0);

  const names = useMemo(
    () => new Map((members.data ?? []).map((member) => [member.userId, memberName(member)])),
    [members.data],
  );

  // Lu dès qu'il est à l'écran, et de nouveau à chaque message reçu pendant
  // la lecture : Realtime relit le groupe, qui revient avec un compteur non nul.
  const unread = group.data?.unreadCount ?? 0;
  useEffect(() => {
    if (focused && unread > 0) markRead.mutate();
  }, [focused, unread, markRead.mutate]);

  // Un message arrivé clôt l'indicateur de son auteur.
  const last = messages.data?.items.at(-1);
  useEffect(() => {
    if (last?.role === "user") clearTyping(last.authorId);
  }, [last?.id, last?.role, last?.authorId, clearTyping]);

  // `inverted` pose le plus récent en bas sans calcul de défilement : la liste
  // lui est donc donnée du plus récent au plus ancien.
  const items = useMemo(() => [...(messages.data?.items ?? [])].reverse(), [messages.data]);

  const authorLabel = (message: Pick<GroupMessage, "role" | "authorId">) =>
    message.role === "assistant" ? assistantName : (names.get(message.authorId) ?? "Ancien membre");

  const replyTarget = replyToId ? items.find((message) => message.id === replyToId) : undefined;

  const startReply = (messageId: string) => {
    setReplyToId(messageId);
    inputRef.current?.focus();
  };

  // Seul un message chargé peut être rejoint : un message plus ancien que la
  // page ouverte n'est rappelé que par sa citation.
  const scrollToMessage = (messageId: string) => {
    const index = items.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    scrollRetries.current = 0;
    listRef.current?.scrollToIndex({ index, viewPosition: 0.5 });
  };

  const submit = () => {
    const content = draft.trim();
    if (!content || send.isPending) return;
    send.mutate(
      { content, ...(replyTarget ? { replyToId: replyTarget.id } : {}) },
      {
        onSuccess: () => {
          setDraft("");
          setReplyToId(null);
        },
      },
    );
  };

  const typingNames = typingUserIds
    .filter((id) => id !== selfId)
    .map((id) => names.get(id))
    .filter((name): name is string => Boolean(name));

  return (
    <ScreenShell
      title={group.data?.title ?? ""}
      scrolls={false}
      onBack={compact ? () => router.back() : undefined}
      action={
        group.data ? (
          <View className="flex-row items-center gap-1">
            <Button
              variant="ghost"
              onPress={() => setFiling(true)}
              accessibilityLabel="Ranger la conversation dans des dossiers de l'espace"
              className="gap-2"
            >
              <Icon as={FolderInput} size={16} className="text-muted-foreground" />
              {compact ? null : <Text className="text-sm text-muted-foreground">Ranger</Text>}
            </Button>
            {/* Réglage du groupe entier et non de l'appelant : c'est le groupe
              qui choisit si Jean-Claude intervient de lui-même. */}
            <Button
              variant="ghost"
              onPress={() => setMuted.mutate(!muted)}
              disabled={setMuted.isPending}
              accessibilityLabel={
                muted
                  ? `${assistantName} ne répond que si on le mentionne. Le laisser intervenir de lui-même`
                  : `${assistantName} intervient de lui-même. Le limiter aux mentions`
              }
              className="gap-2"
            >
              <Icon as={muted ? BellOff : Bell} size={16} className="text-muted-foreground" />
              {/* Icône seule sur téléphone : le libellé mangerait le titre du groupe. */}
              {compact ? null : (
                <Text className="text-sm text-muted-foreground">
                  {muted ? "Sur mention" : `${assistantName} actif`}
                </Text>
              )}
            </Button>
          </View>
        ) : undefined
      }
    >
      <GroupFoldersDialog
        group={filing ? (group.data ?? null) : null}
        onClose={() => setFiling(false)}
      />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: palette.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {group.error || messages.error ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center text-sm text-muted-foreground">
              Cette discussion est introuvable, ou vous n'en faites plus partie.
            </Text>
          </View>
        ) : messages.isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={palette.accent} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            inverted
            data={items}
            keyExtractor={(message) => message.id}
            // Hauteurs variables, donc inconnues d'avance : on approche la
            // position, puis on réessaie, la zone dessinée. Chaque essai
            // mesure un peu plus du fil et rapproche du message visé.
            onScrollToIndexFailed={(info) => {
              listRef.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: true,
              });
              if (scrollRetries.current >= QUOTE_SCROLL_RETRIES) return;
              scrollRetries.current += 1;
              setTimeout(
                () => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5 }),
                100,
              );
            }}
            contentContainerStyle={[
              { padding: spacing.lg, gap: spacing.md },
              contentColumn(compact, READING_MAX_WIDTH),
            ]}
            renderItem={({ item, index }) => {
              // Liste inversée : le message précédent à l'écran est le suivant
              // dans le tableau.
              const previous = items[index + 1];
              const showAuthor =
                previous === undefined ||
                previous.authorId !== item.authorId ||
                previous.role !== item.role;
              return (
                <MessageBubble
                  message={item}
                  selfId={selfId}
                  speaking={speakingId === item.id}
                  onToggleSpeech={toggleSpeech}
                  author={showAuthor ? authorLabel(item) : null}
                  quote={
                    item.replyTo
                      ? {
                          id: item.replyTo.id,
                          author: authorLabel(item.replyTo),
                          content: quotedText(item.replyTo),
                        }
                      : null
                  }
                  onReply={startReply}
                  onPressQuote={scrollToMessage}
                  suggestion={suggestionByMessage.get(item.id) ?? null}
                  workspaceId={workspaceId}
                  nameOf={(userId) => names.get(userId) ?? "Ancien membre"}
                  onOpenList={(listId) => router.push(`/workspace/${workspaceId}/list/${listId}`)}
                />
              );
            }}
            ListEmptyComponent={
              // La liste est inversée : son contenu vide l'est aussi.
              <View style={{ transform: [{ scaleY: -1 }] }} className="items-center py-10">
                <Text className="text-sm text-muted-foreground">
                  Aucun message pour l'instant. Lancez la discussion.
                </Text>
              </View>
            }
          />
        )}

        <View
          style={[
            contentColumn(compact, READING_MAX_WIDTH),
            { padding: spacing.md, paddingBottom: spacing.md + insets.bottom },
          ]}
        >
          <Text className="h-5 px-1 text-xs text-muted-foreground" numberOfLines={1}>
            {typingLabel(typingNames)}
          </Text>
          {replyTarget ? (
            <ReplyBanner
              author={authorLabel(replyTarget)}
              content={quotedText(replyTarget)}
              onCancel={() => setReplyToId(null)}
            />
          ) : null}
          <Composer
            inputRef={inputRef}
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              if (text.trim()) notifyTyping();
            }}
            onSubmit={submit}
            placeholder={`Écrire un message — @${assistantName} pour l'appeler`}
            busy={send.isPending}
            slashCommands={false}
            mentionName={assistantName}
          />
          {/* Même mention que sous le champ du fil personnel. */}
          <Text
            className="mt-2 text-center text-xs text-muted-foreground"
            style={{ fontFamily: FONT_FAMILY }}
          >
            Jean-Claude comme tout non-humain peut faire des erreurs. Veuillez vérifier les
            réponses.
          </Text>
          {send.isError ? (
            <Text className="mt-1 text-xs text-destructive">
              Le message n'a pas pu être envoyé. Réessayez dans un instant.
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

function MessageBubble({
  message,
  selfId,
  author,
  quote,
  onReply,
  onPressQuote,
  speaking,
  onToggleSpeech,
  suggestion,
  workspaceId,
  nameOf,
  onOpenList,
}: {
  message: GroupMessage;
  selfId: string | null;
  speaking: boolean;
  onToggleSpeech: (messageId: string, content: string) => void;
  /** `null` quand le message précédent vient déjà de la même personne. */
  author: string | null;
  quote: { id: string; author: string; content: string } | null;
  onReply: (messageId: string) => void;
  onPressQuote: (messageId: string) => void;
  /** Liste proposée par Jean-Claude dans ce message, s'il y en a une. */
  suggestion: GroupListSuggestion | null;
  workspaceId: string;
  nameOf: (userId: string) => string;
  onOpenList: (listId: string) => void;
}) {
  const mine = message.role === "user" && message.authorId === selfId;

  return (
    <View style={{ gap: spacing.md }}>
      {/* La même rangée que le fil personnel, avec ses commandes au survol.
          « Réessayer » et « Modifier » n'y sont pas : ils rejouent un tour de
          modèle, ce qu'un fil partagé ne permet pas. */}
      <MessageRow
        message={message}
        author={mine ? null : author}
        mine={mine}
        quote={quote}
        onReply={onReply}
        onPressQuote={onPressQuote}
        busy={false}
        speaking={speaking}
        onToggleSpeech={onToggleSpeech}
      />
      {suggestion ? (
        <GroupListSuggestionCard
          suggestion={suggestion}
          workspaceId={workspaceId}
          nameOf={nameOf}
          onOpenList={onOpenList}
        />
      ) : null}
    </View>
  );
}

/** Rappel du message cité au-dessus du champ, tant que la réponse n'est pas partie. */
function ReplyBanner({
  author,
  content,
  onCancel,
}: {
  author: string;
  content: string;
  onCancel: () => void;
}) {
  const { palette } = useTheme();

  return (
    <View
      className="mb-2 flex-row items-center gap-2 rounded-md bg-muted py-1 pl-3"
      style={{ borderLeftWidth: 3, borderLeftColor: palette.accent }}
    >
      <View className="flex-1">
        <Text className="text-xs font-medium text-primary" numberOfLines={1}>
          Réponse à {author}
        </Text>
        <Text className="text-sm text-muted-foreground" numberOfLines={1}>
          {content}
        </Text>
      </View>
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Ne plus répondre à ce message"
        style={{
          width: MIN_TOUCH_TARGET,
          height: MIN_TOUCH_TARGET,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon as={X} size={16} className="text-muted-foreground" />
      </Pressable>
    </View>
  );
}

/** Au-delà, le message cité reste hors d'atteinte : on s'arrête où l'on est. */
const QUOTE_SCROLL_RETRIES = 8;

/**
 * Texte d'un message cité. Une réponse de Jean-Claude est du Markdown : sur
 * deux lignes, ses astérisques se liraient au lieu du gras.
 */
function quotedText(message: Pick<GroupMessage, "role" | "content">): string {
  return message.role === "assistant" ? markdownToSpeech(message.content) : message.content;
}

function typingLabel(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} écrit…`;
  if (names.length === 2) return `${names[0]} et ${names[1]} écrivent…`;
  return "Plusieurs personnes écrivent…";
}

function memberName(member: WorkspaceMember): string {
  return member.displayName ?? member.email ?? "Ancien membre";
}
