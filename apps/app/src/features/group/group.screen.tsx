import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, View } from "react-native";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowUp, AtSign, FolderInput, Lock, Sparkles } from "lucide-react-native";
import { mentionsAssistant, type GroupMessage, type WorkspaceMember } from "@jc/domain";
import { useWorkspaceMembers } from "@/features/workspace/hooks/use-workspaces";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useAssistantName } from "@/shared/hooks/use-profile";
import { cn } from "@/shared/lib/utils";
import { useAuth } from "@/shared/providers/auth-provider";
import { useTheme } from "@/shared/providers/theme-provider";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { contentColumn, READING_MAX_WIDTH, ScreenShell } from "@/shared/ui/screen-shell";
import { Text } from "@/shared/ui/text";
import { GroupAssistantDialog } from "./GroupAssistantDialog";
import { GroupFoldersDialog } from "./GroupFoldersDialog";
import { useGroupTyping } from "./hooks/use-group-realtime";
import {
  useGroup,
  useGroupMessages,
  useMarkGroupRead,
  useSendGroupMessage,
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
  const focused = useIsFocused();
  const { session } = useAuth();
  const selfId = session?.user.id ?? null;
  const assistantName = useAssistantName();

  const group = useGroup(groupId);
  const messages = useGroupMessages(groupId);
  const members = useWorkspaceMembers(workspaceId);
  const markRead = useMarkGroupRead(groupId);
  const send = useSendGroupMessage(groupId);
  const muted = group.data?.aiMuted ?? false;
  const {
    typingUserIds,
    assistantThinking,
    notifyTyping,
    clearTyping,
    notifyAssistantThinking,
    clearAssistantThinking,
  } = useGroupTyping(groupId);
  const [draft, setDraft] = useState("");
  const [filing, setFiling] = useState(false);
  const [configuring, setConfiguring] = useState(false);

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
    // Sa réponse, ou l'annonce qu'il n'a pas pu répondre, clôt l'attente.
    if (last && last.role !== "user") clearAssistantThinking();
  }, [last?.id, last?.role, last?.authorId, clearTyping, clearAssistantThinking]);

  const submit = () => {
    const content = draft.trim();
    if (!content || send.isPending) return;
    send.mutate(content, {
      onSuccess: () => {
        setDraft("");
        // Une mention promet une réponse : sans ce signal, l'auteur attend sans
        // savoir si Jean-Claude a été appelé.
        if (mentionsAssistant(content)) notifyAssistantThinking();
      },
    });
  };

  // `inverted` pose le plus récent en bas sans calcul de défilement : la liste
  // lui est donc donnée du plus récent au plus ancien.
  const items = useMemo(() => [...(messages.data?.items ?? [])].reverse(), [messages.data]);

  const authorLabel = (message: GroupMessage) =>
    message.role === "assistant" ? assistantName : (names.get(message.authorId) ?? "Ancien membre");

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
              onPress={() => setConfiguring(true)}
              accessibilityLabel={
                muted
                  ? `${assistantName} ne répond que si on le mentionne. Modifier`
                  : `${assistantName} intervient de lui-même. Modifier`
              }
              className="gap-2"
            >
              <Icon as={muted ? AtSign : Sparkles} size={16} className="text-muted-foreground" />
              {/* Icône seule sur téléphone : le libellé mangerait le titre du groupe. */}
              {compact ? null : (
                <Text className="text-sm text-muted-foreground">
                  {muted ? "Sur mention" : "Intervient seul"}
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
      <GroupAssistantDialog
        group={configuring ? (group.data ?? null) : null}
        assistantName={assistantName}
        onClose={() => setConfiguring(false)}
      />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: palette.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {group.data ? (
          // Dit ce que le fil ne montre pas : qui lit, et ce que l'IA ignore.
          // Toujours affiché, et non seulement au mot d'accueil, qui remonte
          // hors de l'écran et manque aux conversations créées avant lui.
          <View
            className="flex-row items-start gap-2 border-b border-border py-2"
            style={contentColumn(compact, READING_MAX_WIDTH)}
          >
            <Icon as={Lock} size={12} className="mt-0.5 text-muted-foreground" />
            <Text className="flex-1 text-xs text-muted-foreground">
              {`Visible par les ${group.data.memberIds.length} membres de cette conversation. ${assistantName} ne voit que ce fil, jamais vos échanges privés.`}
            </Text>
          </View>
        ) : null}
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
            inverted
            data={items}
            keyExtractor={(message) => message.id}
            contentContainerStyle={[
              { paddingVertical: 16, gap: 4 },
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
                  mine={item.role === "user" && item.authorId === selfId}
                  author={showAuthor ? authorLabel(item) : null}
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
          className="border-t border-border pb-3 pt-2"
          style={contentColumn(compact, READING_MAX_WIDTH)}
        >
          <Text className="h-5 px-1 text-xs text-muted-foreground" numberOfLines={1}>
            {[typingLabel(typingNames), assistantThinking ? `${assistantName} réfléchit…` : ""]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          <View className="flex-row items-center gap-2">
            <Input
              className="flex-1"
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                if (text.trim()) notifyTyping();
              }}
              onSubmitEditing={submit}
              placeholder={`Écrire un message — @${assistantName} pour l'appeler`}
              returnKeyType="send"
              blurOnSubmit={false}
              accessibilityLabel="Message à la conversation"
            />
            <Button
              size="icon"
              onPress={submit}
              disabled={!draft.trim() || send.isPending}
              accessibilityLabel="Envoyer"
              style={{ backgroundColor: palette.accent }}
            >
              <Icon as={ArrowUp} size={18} color={palette.accentText} />
            </Button>
          </View>
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
  mine,
  author,
}: {
  message: GroupMessage;
  mine: boolean;
  /** `null` quand le message précédent vient déjà de la même personne. */
  author: string | null;
}) {
  const { palette } = useTheme();

  if (message.role === "system") {
    return (
      <View className="mt-2 items-center px-4">
        <Text className="text-center text-xs text-muted-foreground">{message.content}</Text>
      </View>
    );
  }

  return (
    <View className={cn("max-w-[85%] gap-0.5", mine ? "self-end" : "self-start", author && "mt-2")}>
      {author && !mine ? (
        <Text className="px-1 text-xs font-medium text-muted-foreground">{author}</Text>
      ) : null}
      <View
        className="rounded-2xl px-3.5 py-2"
        style={{ backgroundColor: mine ? palette.accentSoft : palette.surface }}
      >
        <Text style={{ color: mine ? palette.accentSoftText : palette.text }}>
          {message.content}
        </Text>
      </View>
    </View>
  );
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
