import { useRef, useState, type ReactNode } from "react";
import { PanResponder, ScrollView, View } from "react-native";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "expo-router";
import { vars } from "nativewind";
import {
  ChevronsUpDown,
  Inbox,
  ListChecks,
  LogOut,
  MessageCircle,
  MessageSquareWarning,
  MessagesSquare,
  Mail,
  PanelLeft,
  Plus,
  Search,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import { ApiError } from "@jc/api-client";
import type { Conversation, Folder, FolderTreeNode, Group, TaskList } from "@jc/domain";
import { api } from "@/shared/lib/api";
import {
  ConversationContextMenu,
  type ConversationMenuTarget,
} from "@/features/conversation/ConversationContextMenu";
import { ConversationDeleteDialog } from "@/features/conversation/ConversationDeleteDialog";
import { ConversationDialog } from "@/features/conversation/ConversationDialog";
import {
  ConversationDropDialog,
  type ConversationDrop,
} from "@/features/conversation/ConversationDropDialog";
import { ConversationNameRow } from "@/features/conversation/ConversationNameRow";
import { FeedbackDialog } from "@/features/feedback/FeedbackDialog";
import { SearchDialog } from "@/features/search/SearchDialog";
import { FolderContextMenu, type FolderMenuTarget } from "@/features/folder/FolderContextMenu";
import { FolderDeleteDialog } from "@/features/folder/FolderDeleteDialog";
import { moveErrorMessage, useFolderActions } from "@/features/folder/hooks/use-folder-actions";
import { FolderNameRow, type FolderNameTarget } from "@/features/folder/FolderNameRow";
import { TaskListDialog, type TaskListTarget } from "@/features/todo/TaskListDialog";
import { useExtractGroupList } from "@/features/group/hooks/use-groups";
import { GroupFoldersDialog } from "@/features/group/GroupFoldersDialog";
import { WorkspaceSidebarBody } from "@/features/workspace/WorkspaceSidebarBody";
import { InvitationsDialog } from "@/features/workspace/InvitationsDialog";
import { useReceivedInvitations, useWorkspaces } from "@/features/workspace/hooks/use-workspaces";
import { WorkspaceNameDialog } from "@/features/workspace/WorkspaceNameDialog";
import {
  useConversationDragSource,
  useFolderDragSource,
  useFolderDropTarget,
} from "./sidebar-drag";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import { Icon } from "@/shared/ui/icon";
import { Separator } from "@/shared/ui/separator";
import { ContextMenu } from "@/shared/ui/context-menu";
import { Text } from "@/shared/ui/text";
import { useCurrentUser } from "@/shared/hooks/use-current-user";
import { cn } from "@/shared/lib/utils";
import { useAssistantName, useProfile } from "@/shared/hooks/use-profile";
import { useAuth } from "@/shared/providers/auth-provider";
import { useTheme } from "@/shared/providers/theme-provider";
import { useSidebarData, type SidebarGroup } from "./use-sidebar-data";
import {
  contextMenuProps,
  FolderToggleIcon,
  NewConversationRow,
  RECENT_PAGE_SIZE,
  RowMenuButton,
  rowLabel,
  SectionLabel,
  selected,
  ShowMoreRow,
  UnreadBadge,
  useSectionOpen,
} from "./SidebarSection";
import { UTILITY_LINKS } from "./utility-links";

/** Largeur de la barre latérale avant tout ajustement — les 256 pt de `w-64`. */
export const SIDEBAR_DEFAULT_WIDTH = 256;

/**
 * Bornes du redimensionnement.
 *
 * Sous 200 pt, les titres de conversation se tronquent au 2e mot et
 * l'arborescence devient illisible ; au-delà de 420 pt, la barre mange la
 * colonne de lecture du fil sur un écran d'ordinateur portable.
 */
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 420;

export type AppSidebarProps = {
  /** Referme le tiroir après navigation — sans effet quand la barre est fixe. */
  onNavigate?: () => void;
  /** Largeur courante ; le parent la détient pour qu'elle survive au repli. */
  width?: number;
  /** Fourni uniquement quand la barre est fixe : le tiroir ne se redimensionne pas. */
  onResize?: (width: number) => void;
  /** Masque la barre depuis son propre en-tête. */
  onCollapse?: () => void;
};

/** Calendrier puis listes : l'ordre de l'en-tête de la barre. */
const HEADER_SHORTCUTS = ["/calendar", "/todo"].flatMap((href) =>
  UTILITY_LINKS.filter((link) => link.href === href),
);

/**
 * Barre latérale de navigation.
 *
 * Reprend la structure du bloc `sidebar` de shadcn : en-tête, sections
 * libellées, groupes repliables, pied de barre. Le bloc lui-même n'existe pas
 * dans react-native-reusables — il tient à Radix, donc au DOM — il est ici
 * recomposé depuis les primitives portées (`Collapsible`, `Button`,
 * `Separator`), ce qui le rend utilisable aussi sur iOS et Android.
 */
export function AppSidebar({
  onNavigate,
  width = SIDEBAR_DEFAULT_WIDTH,
  onResize,
  onCollapse,
}: AppSidebarProps) {
  const { displayName, initials } = useCurrentUser();
  const { signOut } = useAuth();
  const [searching, setSearching] = useState(false);
  /** Point d'ouverture du menu du profil, `null` quand il est fermé. */
  const [profileMenu, setProfileMenu] = useState<{ x: number; y: number } | null>(null);
  const [foldersOpen, toggleFolders] = useSectionOpen("folders");
  const [collaborationsOpen, toggleCollaborations] = useSectionOpen("collaborations");
  const [conversationsOpen, toggleConversations] = useSectionOpen("recents");
  const [recentLimit, setRecentLimit] = useState(RECENT_PAGE_SIZE);
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const assistantName = useAssistantName();
  const isAdmin = useProfile().data?.isAdmin === true;
  const { palette } = useTheme();
  const { groups, all, channel, isLoading, error } = useSidebarData();
  const [deleting, setDeleting] = useState<Folder | null>(null);
  const [menuTarget, setMenuTarget] = useState<FolderMenuTarget | null>(null);
  /** Dossier en cours de nommage — création ou renommage, `null` si aucun. */
  const [naming, setNaming] = useState<FolderNameTarget | null>(null);
  /** Todoliste en cours de création depuis un dossier, `null` si aucune. */
  const [listTarget, setListTarget] = useState<TaskListTarget | null>(null);
  /** Conversation dont le menu contextuel est ouvert, `null` si aucun. */
  const [conversationMenu, setConversationMenu] = useState<ConversationMenuTarget | null>(null);
  /** Conversation dont le titre s'édite en ligne, `null` si aucune. */
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  /** Conversation dont la fenêtre de rangement est ouverte, `null` si aucune. */
  const [filing, setFiling] = useState<Conversation | null>(null);
  /** Conversation en attente de confirmation de suppression, `null` si aucune. */
  const [deletingConversation, setDeletingConversation] = useState<Conversation | null>(null);
  /** Conversation lâchée sur un dossier, en attente du choix de rangement. */
  const [drop, setDrop] = useState<ConversationDrop | null>(null);
  /** Ce qu'a répondu le serveur au dernier déplacement raté, `null` sinon. */
  const [moveError, setMoveError] = useState<string | null>(null);
  /** Ce qu'a répondu le serveur à la dernière conversion en todoliste ratée. */
  const [extractError, setExtractError] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { move } = useFolderActions();
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [invitationsOpen, setInvitationsOpen] = useState(false);
  const receivedInvitations = useReceivedInvitations();
  const pendingInvitations = (receivedInvitations.data ?? []).filter(
    (invitation) => invitation.status === "pending",
  ).length;
  /** Conversation de groupe dont le menu est ouvert depuis « Récents ». */
  const [groupMenu, setGroupMenu] = useState<ConversationMenuTarget<Group> | null>(null);
  const [filingGroup, setFilingGroup] = useState<Group | null>(null);
  const workspaces = useWorkspaces();
  const workspaceItems = workspaces.data ?? [];
  // Même clé que `useGroups` : le cache est partagé avec la section de l'espace.
  const groupQueries = useQueries({
    queries: workspaceItems.map((workspace) => ({
      queryKey: ["workspace", workspace.id, "groups"] as const,
      queryFn: () => api.groups.list(workspace.id),
    })),
  });
  const extractGroupList = useExtractGroupList();

  const go = (href: string) => {
    router.push(href as never);
    onNavigate?.();
  };

  /**
   * Conversion à la demande (A.2, #17) : la carte de proposition se lit dans
   * le fil de la conversation visée, comme n'importe quelle autre suggestion
   * — l'assistant propose, il n'exécute pas (§12.1).
   */
  const extractTaskList = useMutation({
    mutationFn: (id: string) => api.conversations.extractTaskList(id),
    onSuccess: async (_suggestion, id) => {
      setExtractError(null);
      await queryClient.invalidateQueries({ queryKey: ["conversation", id, "suggestions"] });
      go(`/chat/${id}`);
    },
    onError: (cause: Error) => setExtractError(extractErrorMessage(cause)),
  });

  const createRootFolder = () => setNaming({ kind: "create", parentId: null });

  /**
   * Conversation lâchée sur un dossier.
   *
   * Rien à faire quand elle n'est déjà rangée que là : la fenêtre poserait une
   * question dont les deux réponses donnent le même résultat.
   */
  const dropOnFolder = (folder: FolderTreeNode, conversationId: string) => {
    const conversation = all.find((item) => item.id === conversationId);
    if (!conversation) return;
    if (conversation.folderIds.length === 1 && conversation.folderIds[0] === folder.id) return;

    setDrop({ conversation, folder });
  };

  /**
   * Dossier lâché sur un autre, ou sur l'en-tête de section pour le remonter à
   * la racine. Sa branche entière le suit — sous-dossiers, conversations et
   * todolistes gardent leur rangement relatif.
   *
   * Les trois refus se lisent depuis l'arborescence déjà chargée. Le serveur
   * les refuse aussi, mais un aller-retour pour un geste sans effet afficherait
   * une erreur là où il ne s'est rien passé. La profondeur et les homonymes,
   * eux, restent à sa charge : la barre n'a pas de quoi les trancher.
   */
  const moveFolder = (targetId: string | null, movedId: string) => {
    if (movedId === targetId) return;

    const moved = findGroup(groups, movedId);
    if (!moved) return;
    if (moved.folder.parentId === targetId) return;
    if (targetId !== null && findGroup(moved.children, targetId)) return;

    setMoveError(null);
    move.mutate(
      { id: movedId, parentId: targetId },
      { onError: (cause) => setMoveError(moveErrorMessage(cause)) },
    );
  };

  const { ref: rootDropRef, isOver: isOverRoot } = useFolderDropTarget({
    onFolder: (folderId) => moveFolder(null, folderId),
  });

  // « Récents » mêle les deux listes déjà chargées. Le tri n'est pas une règle
  // métier : chaque source arrive déjà ordonnée, et seule l'interface a besoin
  // de les entrelacer par date du dernier message.
  const recent = [
    ...all.map((conversation) => ({
      kind: "personal" as const,
      id: conversation.id,
      at: activityTime(conversation.lastMessageAt, conversation.createdAt),
      conversation,
    })),
    ...groupQueries.flatMap((query) =>
      (query.data ?? []).map((group) => ({
        kind: "group" as const,
        id: group.id,
        at: activityTime(group.lastMessageAt, group.createdAt),
        group,
      })),
    ),
  ].sort((left, right) => right.at - left.at);
  const groupsUnavailable = groupQueries.some((query) => query.error);
  const recentUnread = recent.reduce((sum, entry) => {
    if (entry.kind === "personal") {
      if (pathname === `/chat/${entry.conversation.id}`) return sum;
      return sum + entry.conversation.unreadCount;
    }
    if (pathname === `/workspace/${entry.group.workspaceId}/group/${entry.group.id}`) return sum;
    return sum + entry.group.unreadCount;
  }, 0);
  const foldersUnread = all.reduce((sum, conversation) => {
    if (conversation.folderIds.length === 0) return sum;
    if (pathname === `/chat/${conversation.id}`) return sum;
    return sum + conversation.unreadCount;
  }, 0);
  const collaborationsUnread = groupQueries.reduce(
    (sum, query) =>
      sum +
      (query.data ?? []).reduce((inner, group) => {
        if (pathname === `/workspace/${group.workspaceId}/group/${group.id}`) return inner;
        return inner + group.unreadCount;
      }, 0),
    0,
  );

  return (
    <View
      className="h-full border-r border-border bg-secondary"
      // Le fond de survol et de sélection de shadcn (`accent`) est le gris de
      // `surface` — celui de la barre elle-même. La rangée active s'y fondait :
      // rien ne montrait que le calendrier était ouvert. Il est foncé ici, pour
      // la barre seulement ; ailleurs, il se pose sur le fond blanc de l'écran.
      style={[{ width }, vars({ "--accent": palette.border })]}
    >
      <View className="gap-2 p-3">
          {/* Replier et chercher à gauche, courrier à droite. */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1">
              {onCollapse ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onPress={onCollapse}
                  accessibilityLabel="Masquer la navigation"
                >
                  <Icon as={PanelLeft} size={18} className="text-muted-foreground" />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                onPress={() => setSearching(true)}
                accessibilityLabel="Rechercher une conversation"
              >
                <Icon as={Search} size={18} className="text-muted-foreground" />
              </Button>
            </View>
            <View className="relative">
              <Button
                variant="ghost"
                size="icon"
                onPress={() => setInvitationsOpen(true)}
                accessibilityLabel={
                  pendingInvitations > 0
                    ? `Invitations, ${pendingInvitations} en attente`
                    : "Invitations"
                }
              >
                <Icon as={Mail} size={18} className="text-muted-foreground" />
              </Button>
              {pendingInvitations > 0 ? (
                <View className="pointer-events-none absolute -right-0.5 -top-0.5">
                  <UnreadBadge count={pendingInvitations} />
                </View>
              ) : null}
            </View>
          </View>

          <View className="gap-0.5">
            {/* L'action la plus fréquente en premier, seule mise en valeur de la
                liste, comme le « New chat » de Claude (§4.2). La pastille déborde
                de 2 pt de chaque côté pour garder les libellés alignés sur ceux
                des rangées à icône nue. */}
            <Button
              variant="ghost"
              onPress={() => go("/chat")}
              accessibilityLabel="Démarrer une nouvelle conversation"
              className="justify-start gap-3 px-2"
            >
              <View className="-mx-0.5 size-5 items-center justify-center rounded-full bg-primary">
                <Icon as={Plus} size={14} className="text-primary-foreground" />
              </View>
              <Text className="flex-1 text-sm font-medium text-foreground" numberOfLines={1}>
                Nouvelle conversation
              </Text>
            </Button>
            <NavRow
              icon={MessageCircle}
              iconClassName="text-foreground"
              label={
                <>
                  <Text className="font-semibold text-foreground">{assistantName}</Text>
                  {" - Canal permanent"}
                </>
              }
              accessibilityLabel={`Ouvrir le fil permanent avec ${assistantName}`}
              active={pathname === "/assistant"}
              onPress={() => go("/assistant")}
              trailing={
                <UnreadBadge
                  count={pathname === "/assistant" ? 0 : (channel?.unreadCount ?? 0)}
                  pendingQuestion={
                    pathname === "/assistant" ? false : (channel?.hasPendingQuestion ?? false)
                  }
                />
              }
            />
            {HEADER_SHORTCUTS.map((link) => (
              <NavRow
                key={link.href}
                icon={link.icon}
                iconClassName="text-foreground"
                label={link.label}
                active={pathname === link.href}
                onPress={() => go(link.href)}
              />
            ))}
            <NavRow
              icon={Users}
              iconClassName="text-foreground"
              label="Nouvel espace collaboratif"
              active={false}
              onPress={() => setCreatingWorkspace(true)}
            />
          </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-3 pb-4">
          {/* L'en-tête fait office de zone racine : y déposer un dossier le sort
            de son parent. Sans elle, le geste serait à sens unique — on saurait
            ranger un dossier, jamais l'en ressortir. */}
          <View ref={rootDropRef} className={cx("rounded-md", isOverRoot)}>
            <SectionLabel
              action={{ label: "Créer un dossier", onPress: createRootFolder }}
              collapse={{ open: foldersOpen, onToggle: toggleFolders }}
              unread={foldersUnread}
            >
              Mes dossiers
            </SectionLabel>
          </View>

          {moveError ? (
            <Text className="text-destructive px-2 py-1 text-xs">{moveError}</Text>
          ) : null}

          {extractError ? (
            <Text className="text-destructive px-2 py-1 text-xs">{extractError}</Text>
          ) : null}

          {/* Message fixe, et non `error.message` : une erreur brute de fetch ou
            du serveur peut porter des fragments de requête, donc des données
            de l'utilisateur. */}
          {error ? (
            <Text className="px-2 py-1 text-xs text-destructive">
              Dossiers indisponibles pour le moment.
            </Text>
          ) : null}

          {!error && !isLoading && groups.length === 0 && naming === null ? (
            <Button variant="ghost" onPress={createRootFolder} className="justify-start gap-2 px-2">
              <Icon as={Plus} size={14} className="text-muted-foreground" />
              <Text className="text-xs font-normal text-muted-foreground">
                Créer un premier dossier
              </Text>
            </Button>
          ) : null}

          {foldersOpen
            ? groups.map((group) => (
              <FolderGroup
                key={group.folder.id}
                group={group}
                depth={1}
                pathname={pathname}
                naming={naming}
                renamedConversation={renaming}
                onOpen={go}
                onMenu={setMenuTarget}
                onCloseNaming={() => setNaming(null)}
                onNewConversation={(folderId) => go(`/chat?folderId=${folderId}`)}
                onConversationMenu={setConversationMenu}
                onCloseRenaming={() => setRenaming(null)}
                onDropConversation={dropOnFolder}
                onDropFolder={moveFolder}
              />
            ))
            : null}

          {naming?.kind === "create" && naming.parentId === null ? (
            <FolderNameRow target={naming} onDone={() => setNaming(null)} />
          ) : null}

          <SectionLabel
            action={{
              label: "Créer un espace collaboratif",
              onPress: () => setCreatingWorkspace(true),
            }}
            collapse={{ open: collaborationsOpen, onToggle: toggleCollaborations }}
            unread={collaborationsUnread}
          >
            Mes collaborations
          </SectionLabel>

          {collaborationsOpen ? (
            <>
              {workspaces.error ? (
                <Text className="px-2 py-1 text-xs text-destructive">
                  Espaces indisponibles pour le moment.
                </Text>
              ) : null}

              {workspaceItems.map((workspace) => (
                <WorkspaceSidebarBody
                  key={workspace.id}
                  workspaceId={workspace.id}
                  workspaceName={workspace.name}
                  pathname={pathname}
                  onNavigate={go}
                />
              ))}
            </>
          ) : null}

          {/* Toutes les conversations, personnelles et de groupe, à plat — y
            compris celles déjà rangées dans un dossier. Ce n'est pas une
            duplication : la même conversation reste visible depuis son dossier
            et depuis cette vue chronologique (§5.2, A.1). */}
          <SectionLabel
            collapse={{ open: conversationsOpen, onToggle: toggleConversations }}
            unread={recentUnread}
          >
            Récents
          </SectionLabel>

          {/* Tranche prise dans ce qui est déjà chargé : les dossiers ont besoin
              de toutes les conversations pour se remplir, un chargement paginé
              ne ferait donc qu'un second appel pour les mêmes données. */}
          {groupsUnavailable ? (
            <Text className="px-2 py-1 text-xs text-destructive">
              Conversations de groupe indisponibles pour le moment.
            </Text>
          ) : null}

          {extractGroupList.error ? (
            <Text className="px-2 py-1 text-xs text-destructive">
              {extractGroupList.error instanceof ApiError && extractGroupList.error.status < 500
                ? extractGroupList.error.message
                : "La conversion en todoliste a échoué. Réessayez dans un instant."}
            </Text>
          ) : null}

          {conversationsOpen
            ? recent.slice(0, recentLimit).map((entry) =>
              entry.kind === "personal" ? (
                renaming?.id === entry.conversation.id ? (
                  <ConversationNameRow
                    key={`personal-${entry.id}`}
                    conversation={entry.conversation}
                    onDone={() => setRenaming(null)}
                  />
                ) : (
                  <ConversationRow
                    key={`personal-${entry.id}`}
                    conversation={entry.conversation}
                    pathname={pathname}
                    onOpen={go}
                    onMenu={setConversationMenu}
                    draggable={false}
                  />
                )
              ) : (
                <RecentGroupRow
                  key={`group-${entry.id}`}
                  group={entry.group}
                  pathname={pathname}
                  onOpen={go}
                  onMenu={setGroupMenu}
                />
              ),
            )
            : null}

          {conversationsOpen && recent.length > recentLimit ? (
            <ShowMoreRow onPress={() => setRecentLimit((limit) => limit + RECENT_PAGE_SIZE)} />
          ) : null}
        </ScrollView>

      <Separator />

      <View className="gap-0.5 p-3">
          {/* Le profil en pied de barre ouvre le menu du compte : Claude,
              ChatGPT et Slack le placent tous là (§4.2). Les actions rares —
              signalement, revue des retours — y sont rangées plutôt qu'en
              tête de barre. */}
          <Button
            variant="ghost"
            onPress={(event) =>
              setProfileMenu({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })
            }
            accessibilityLabel={`Menu du compte de ${displayName}`}
            className={selected(
              "h-auto min-w-0 justify-start gap-3 px-2 py-2",
              pathname === "/settings",
            )}
          >
            <Avatar alt={`Avatar de ${displayName}`} className="size-8">
              <AvatarFallback className="bg-primary">
                <Text className="text-xs font-semibold text-primary-foreground">{initials}</Text>
              </AvatarFallback>
            </Avatar>
            <Text className="flex-1 text-sm font-medium text-foreground" numberOfLines={1}>
              {displayName}
            </Text>
            <Icon as={ChevronsUpDown} size={14} className="text-muted-foreground" />
          </Button>
      </View>

      {/* Le menu ne fait que choisir : renommage et suppression passent par la
          fenêtre de dossier, la création par une rangée de saisie. */}
      <FolderContextMenu
        target={menuTarget}
        onClose={() => setMenuTarget(null)}
        onRename={({ folder }) => {
          setMenuTarget(null);
          setNaming({ kind: "rename", folder });
        }}
        onAddChild={({ folder }) => {
          setMenuTarget(null);
          setNaming({ kind: "create", parentId: folder.id });
        }}
        onAddTaskList={({ folder }) => {
          setMenuTarget(null);
          setListTarget({ mode: "create", folderId: folder.id });
        }}
        onDelete={({ folder }) => {
          setMenuTarget(null);
          setDeleting(folder);
        }}
      />

      <FolderDeleteDialog folder={deleting} onClose={() => setDeleting(null)} />

      {/* Clic droit sur une conversation : le renommage se fait en ligne, le
          rangement et la suppression dans leur fenêtre. */}
      <ConversationContextMenu
        target={conversationMenu}
        onClose={() => setConversationMenu(null)}
        onRename={({ conversation }) => {
          setConversationMenu(null);
          setRenaming(conversation);
        }}
        onFile={({ conversation }) => {
          setConversationMenu(null);
          setFiling(conversation);
        }}
        onConvertToTaskList={({ conversation }) => {
          setConversationMenu(null);
          extractTaskList.mutate(conversation.id);
        }}
        onDelete={({ conversation }) => {
          setConversationMenu(null);
          setDeletingConversation(conversation);
        }}
      />

      {/* La fenêtre de la conversation porte déjà l'arborescence cochable :
          une conversation appartient à plusieurs dossiers (§5.2, A.1). */}
      <ConversationDialog
        conversation={filing}
        onClose={() => setFiling(null)}
        onDeleted={() => setFiling(null)}
      />

      <ConversationDeleteDialog
        conversation={deletingConversation}
        onClose={() => setDeletingConversation(null)}
        onDeleted={(conversation) => {
          setDeletingConversation(null);
          // La conversation supprimée ne doit pas rester à l'écran, ni dans
          // l'historique de navigation.
          if (pathname === `/chat/${conversation.id}`) router.replace("/chat");
        }}
      />

      <ConversationDropDialog drop={drop} onClose={() => setDrop(null)} />

      {/* Créer depuis un dossier est le seul moment où le rangement précède la
          capture (§13.4.1) : l'utilisateur l'a déjà exprimé en partant de là. */}
      <TaskListDialog target={listTarget} onClose={() => setListTarget(null)} />
      <ConversationContextMenu<Group>
        target={groupMenu}
        onClose={() => setGroupMenu(null)}
        onFile={({ conversation }) => {
          setGroupMenu(null);
          setFilingGroup(conversation);
        }}
        onConvertToTaskList={({ conversation }) => {
          setGroupMenu(null);
          extractGroupList.mutate(conversation.id, {
            onSuccess: () => go(`/workspace/${conversation.workspaceId}/group/${conversation.id}`),
          });
        }}
      />
      <GroupFoldersDialog group={filingGroup} onClose={() => setFilingGroup(null)} />
      <InvitationsDialog open={invitationsOpen} onClose={() => setInvitationsOpen(false)} />
      <WorkspaceNameDialog
        target={creatingWorkspace ? { kind: "create" } : null}
        onClose={() => setCreatingWorkspace(false)}
        onDone={(workspace) => {
          setCreatingWorkspace(false);
          go(`/workspace/${workspace.id}`);
        }}
      />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      {profileMenu ? (
        <ContextMenu
          x={profileMenu.x}
          y={profileMenu.y}
          onClose={() => setProfileMenu(null)}
          items={[
            { label: "Réglages", icon: Settings, onPress: () => go("/settings") },
            // Signalement direct, distinct des suggestions du modèle (§12.1) :
            // un geste utilisateur, jamais une proposition (A.10).
            {
              label: "Signaler un problème",
              icon: MessageSquareWarning,
              onPress: () => setFeedbackOpen(true),
            },
            // La revue des signalements n'existe que pour l'équipe.
            ...(isAdmin
              ? [{ label: "Retours des testeurs", icon: Inbox, onPress: () => go("/feedback") }]
              : []),
            { label: "Se déconnecter", icon: LogOut, onPress: () => void signOut() },
          ].map((item) => ({
            ...item,
            onPress: () => {
              setProfileMenu(null);
              item.onPress();
            },
          }))}
        />
      ) : null}
      <SearchDialog
        open={searching}
        onClose={() => setSearching(false)}
        onSelect={(conversation) => {
          setSearching(false);
          go(`/chat/${conversation.id}`);
        }}
      />

      {onResize ? <ResizeHandle width={width} onResize={onResize} /> : null}
    </View>
  );
}

/**
 * Poignée de redimensionnement, posée à cheval sur la bordure droite.
 *
 * `PanResponder` plutôt qu'un gestionnaire de souris : le même code sert le web
 * et le tactile, et la barre est destinée à devenir redimensionnable sur
 * tablette. Le geste part de la largeur au moment de la prise, et non de la
 * largeur courante, sinon chaque image de l'animation cumulerait le
 * déplacement déjà appliqué.
 */
function ResizeHandle({ width, onResize }: { width: number; onResize: (width: number) => void }) {
  // Les callbacks du `PanResponder` sont figés à sa création : ces références
  // sont ce qui leur donne accès aux valeurs du rendu courant.
  const latest = useRef({ width, onResize });
  latest.current = { width, onResize };
  const startWidth = useRef(width);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startWidth.current = latest.current.width;
      },
      onPanResponderMove: (_event, gesture) => {
        const next = Math.min(
          SIDEBAR_MAX_WIDTH,
          Math.max(SIDEBAR_MIN_WIDTH, startWidth.current + gesture.dx),
        );
        latest.current.onResize(next);
      },
      // Sans ce refus, un mouvement rapide qui passe par-dessus la liste des
      // conversations ou le contenu du fil peut céder le geste à leur propre
      // responder (défilement, glisser-déposer) : la poignée n'a que 12 pt de
      // large, le curseur en sort facilement pendant un glissement rapide.
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  return (
    <View
      {...responder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel="Ajuster la largeur de la navigation"
      // 12 pt de large centrés sur la bordure : assez pour être attrapé à la
      // souris sans viser, trop peu pour manger le contenu de la barre.
      className="absolute inset-y-0 -right-1.5 w-3 web:cursor-col-resize"
    />
  );
}

/** Une destination de la barre hors arborescence : raccourci, lien d'espace, action. */
function NavRow({
  icon,
  label,
  accessibilityLabel,
  iconClassName = "text-muted-foreground",
  active,
  onPress,
  trailing,
}: {
  icon: LucideIcon;
  /** Un libellé composé (partie en gras) doit fournir `accessibilityLabel`. */
  label: ReactNode;
  accessibilityLabel?: string;
  iconClassName?: string;
  active: boolean;
  onPress: () => void;
  trailing?: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? (typeof label === "string" ? label : undefined)}
      accessibilityState={{ selected: active }}
      className={selected("justify-start gap-3 px-2", active)}
    >
      <Icon as={icon} size={16} className={iconClassName} />
      <Text
        className={cn("flex-1 text-sm text-foreground", active ? "font-medium" : "font-normal")}
        numberOfLines={1}
      >
        {label}
      </Text>
      {trailing}
    </Button>
  );
}

/** Ajoute le fond de survol shadcn quand la rangée est survolée par un glisser. */
function cx(base: string, active: boolean): string {
  return active ? `${base} bg-accent` : base;
}

/**
 * Un dossier, ses sous-dossiers et leurs conversations, repliables d'un geste.
 *
 * Récursif, et repliable à chaque niveau : avec 5 niveaux possibles, un cran
 * de repli réservé à la racine laisserait des branches entières impossibles à
 * escamoter. `depth` (1 pour un dossier racine) sert à savoir si le dossier
 * peut encore accueillir un sous-dossier.
 */
/** Non-lus du dossier et de ses sous-dossiers, sans compter deux fois la même conversation. */
function unreadInFolder(group: SidebarGroup, pathname: string): number {
  const seen = new Set<string>();

  const walk = (current: SidebarGroup): number => {
    let sum = 0;
    for (const conversation of current.conversations) {
      if (seen.has(conversation.id)) continue;
      seen.add(conversation.id);
      if (pathname === `/chat/${conversation.id}`) continue;
      sum += conversation.unreadCount;
    }
    for (const child of current.children) sum += walk(child);
    return sum;
  };

  return walk(group);
}

function FolderGroup({
  group,
  depth,
  pathname,
  naming,
  renamedConversation,
  onOpen,
  onMenu,
  onCloseNaming,
  onNewConversation,
  onConversationMenu,
  onCloseRenaming,
  onDropConversation,
  onDropFolder,
}: {
  group: SidebarGroup;
  depth: number;
  pathname: string;
  /** Dossier en cours de nommage, où qu'il soit dans l'arborescence. */
  naming: FolderNameTarget | null;
  /** Conversation en cours de renommage, où qu'elle soit rangée. */
  renamedConversation: Conversation | null;
  onOpen: (href: string) => void;
  onMenu: (target: FolderMenuTarget) => void;
  onCloseNaming: () => void;
  onNewConversation: (folderId: string) => void;
  onConversationMenu: (target: ConversationMenuTarget) => void;
  onCloseRenaming: () => void;
  onDropConversation: (folder: FolderTreeNode, conversationId: string) => void;
  /** Dossier lâché sur celui-ci : `(cible, déplacé)`. */
  onDropFolder: (targetId: string, movedId: string) => void;
}) {
  // Un dossier est « courant » quand la conversation ouverte est chez lui ou
  // chez l'un de ses descendants : c'est la seule sélection qu'un dossier
  // puisse avoir, n'étant pas lui-même une destination.
  const active = containsPath(group, pathname);
  // Replié par défaut : la liste des dossiers se lit d'un coup d'œil et se
  // déplie à la demande, au lieu d'allonger la barre de tout ce qu'ils
  // contiennent.
  const [open, setOpen] = useState(false);
  const dragRef = useFolderDragSource(group.folder.id);
  const { ref: dropRef, isOver } = useFolderDropTarget({
    onConversation: (conversationId) => onDropConversation(group.folder, conversationId),
    onFolder: (folderId) => onDropFolder(group.folder.id, folderId),
  });
  // Le dossier se déplie de force le temps de la saisie : le sous-dossier
  // qu'on est en train de nommer doit être visible pendant qu'on le nomme.
  const drafting = naming?.kind === "create" && naming.parentId === group.folder.id;
  const renaming = naming?.kind === "rename" && naming.folder.id === group.folder.id;

  // Le renommage se substitue à la rangée du dossier, il ne s'y ajoute pas :
  // le nom s'édite là où il se lit, comme dans un explorateur de fichiers. Le
  // contenu du dossier, lui, reste affiché en dessous.
  if (renaming && naming) {
    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <FolderNameRow target={naming} onDone={onCloseNaming} />
        <CollapsibleContent>
          <FolderChildren
            group={group}
            depth={depth}
            pathname={pathname}
            naming={naming}
            renamedConversation={renamedConversation}
            onOpen={onOpen}
            onMenu={onMenu}
            onCloseNaming={onCloseNaming}
            onNewConversation={onNewConversation}
            onConversationMenu={onConversationMenu}
            onCloseRenaming={onCloseRenaming}
            onDropConversation={onDropConversation}
            onDropFolder={onDropFolder}
          />
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <Collapsible open={open || drafting} onOpenChange={setOpen}>
      {/* Deux vues imbriquées parce qu'une seule ne porte qu'une référence, et
          que la rangée est à la fois ce qu'on saisit et ce sur quoi on lâche.
          C'est la rangée entière et pas seulement son libellé : viser un mot de
          trois lettres à la souris serait intenable. Le contenu du dossier, lui,
          reste hors de la zone — sinon glisser une conversation déplacerait son
          dossier. */}
      <View ref={dragRef}>
        <View ref={dropRef} className={cx("group flex-row items-center rounded-md", isOver)}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="flex-1 justify-start gap-2 px-2"
              // L'appui long est l'équivalent tactile du clic droit : sans lui,
              // renommer un dossier serait impossible sur téléphone.
              onLongPress={(event) =>
                onMenu({
                  folder: group.folder,
                  depth,
                  x: event.nativeEvent.pageX,
                  y: event.nativeEvent.pageY,
                })
              }
              {...contextMenuProps((x, y) => onMenu({ folder: group.folder, depth, x, y }))}
            >
              <FolderToggleIcon open={open || drafting} />
              <Text className={rowLabel(active)} numberOfLines={1}>
                {group.folder.name}
              </Text>
            </Button>
          </CollapsibleTrigger>

          {open || drafting ? null : (
            <UnreadBadge count={unreadInFolder(group, pathname)} />
          )}
          <RowMenuButton
            label={`Actions pour ${group.folder.name}`}
            onOpen={(x, y) => onMenu({ folder: group.folder, depth, x, y })}
          />
        </View>
      </View>

      <CollapsibleContent>
        <FolderChildren
          group={group}
          depth={depth}
          pathname={pathname}
          naming={naming}
          renamedConversation={renamedConversation}
          onOpen={onOpen}
          onMenu={onMenu}
          onCloseNaming={onCloseNaming}
          onNewConversation={onNewConversation}
          onConversationMenu={onConversationMenu}
          onCloseRenaming={onCloseRenaming}
          onDropConversation={onDropConversation}
          onDropFolder={onDropFolder}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Contenu d'un dossier : ses conversations, ses sous-dossiers, et la rangée de
 * saisie quand un sous-dossier s'y crée.
 *
 * Extrait de `FolderGroup` parce qu'il s'affiche aussi pendant le renommage du
 * dossier, où la rangée d'en-tête est remplacée par un champ de saisie.
 */
function FolderChildren({
  group,
  depth,
  pathname,
  naming,
  renamedConversation,
  onOpen,
  onMenu,
  onCloseNaming,
  onNewConversation,
  onConversationMenu,
  onCloseRenaming,
  onDropConversation,
  onDropFolder,
}: {
  group: SidebarGroup;
  depth: number;
  pathname: string;
  naming: FolderNameTarget | null;
  renamedConversation: Conversation | null;
  onOpen: (href: string) => void;
  onMenu: (target: FolderMenuTarget) => void;
  onCloseNaming: () => void;
  onNewConversation: (folderId: string) => void;
  onConversationMenu: (target: ConversationMenuTarget) => void;
  onCloseRenaming: () => void;
  onDropConversation: (folder: FolderTreeNode, conversationId: string) => void;
  /** Dossier lâché sur celui-ci : `(cible, déplacé)`. */
  onDropFolder: (targetId: string, movedId: string) => void;
}) {
  const isEmpty = isFolderEmpty(group);
  const drafting = naming?.kind === "create" && naming.parentId === group.folder.id;

  return (
    // Le filet vertical est ce qui rattache visuellement les conversations à
    // leur dossier, comme dans le bloc shadcn. Il se répète à chaque niveau :
    // au 5e, la barre est très entamée à gauche et les libellés se tronquent —
    // le retrait reste plus lisible qu'un aplatissement qui perdrait la
    // filiation.
    <View className="ml-4 border-l border-border pl-2">
      {group.conversations.map((conversation) =>
        renamedConversation?.id === conversation.id ? (
          <ConversationNameRow
            key={conversation.id}
            conversation={conversation}
            onDone={onCloseRenaming}
          />
        ) : (
          <ConversationRow
            key={conversation.id}
            conversation={conversation}
            pathname={pathname}
            onOpen={onOpen}
            onMenu={onConversationMenu}
          />
        ),
      )}

      {/* Une todoliste se lit dans son dossier thématique autant que dans
          l'onglet Mes listes : c'est la même liste, vue d'un autre endroit (A.2). */}
      {group.taskLists.map((list) => (
        <TaskListRow key={list.id} list={list} onOpen={onOpen} />
      ))}

      {group.children.map((child) => (
        <FolderGroup
          key={child.folder.id}
          group={child}
          depth={depth + 1}
          pathname={pathname}
          naming={naming}
          renamedConversation={renamedConversation}
          onOpen={onOpen}
          onMenu={onMenu}
          onCloseNaming={onCloseNaming}
          onNewConversation={onNewConversation}
          onConversationMenu={onConversationMenu}
          onCloseRenaming={onCloseRenaming}
          onDropConversation={onDropConversation}
          onDropFolder={onDropFolder}
        />
      ))}

      {drafting && naming ? <FolderNameRow target={naming} onDone={onCloseNaming} /> : null}

      {isEmpty && !drafting ? (
        <NewConversationRow onPress={() => onNewConversation(group.folder.id)} />
      ) : null}
    </View>
  );
}

/** Le sous-arbre du dossier visé, où qu'il se trouve dans l'arborescence. */
function findGroup(groups: SidebarGroup[], id: string): SidebarGroup | null {
  for (const group of groups) {
    if (group.folder.id === id) return group;
    const found = findGroup(group.children, id);
    if (found) return found;
  }
  return null;
}

/**
 * Un 4xx dit pourquoi la conversion en todoliste a été refusée — rien
 * d'exploitable dans le fil, ou capacité désactivée dans les réglages
 * (A.10) : le message du serveur est déjà écrit pour l'utilisateur.
 */
function extractErrorMessage(cause: Error): string {
  if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) return cause.message;
  return "La conversion en todoliste a échoué. Réessayez dans un instant.";
}

/** Le dossier, ou l'un de ses descendants, porte-t-il la conversation ouverte ? */
function containsPath(group: SidebarGroup, pathname: string): boolean {
  return (
    group.conversations.some((conversation) => pathname === `/chat/${conversation.id}`) ||
    group.children.some((child) => containsPath(child, pathname))
  );
}

/** Vide au sens de la barre : ni conversation, ni todoliste, ni sous-dossier. */
function isFolderEmpty(group: SidebarGroup): boolean {
  return (
    group.conversations.length === 0 && group.taskLists.length === 0 && group.children.length === 0
  );
}

/**
 * Une todoliste rangée dans ce dossier.
 *
 * Elle ouvre l'onglet Mes listes sur la liste visée plutôt qu'un écran à part :
 * la vue centralisée reste le seul endroit où une liste se lit et se coche,
 * quel que soit le chemin par lequel on y arrive.
 */
function TaskListRow({ list, onOpen }: { list: TaskList; onOpen: (href: string) => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onPress={() => onOpen(`/todo?list=${list.id}`)}
      className="w-full justify-start gap-2 px-2"
    >
      <Icon as={ListChecks} size={14} className="text-muted-foreground" />
      <Text className={rowLabel(false)} numberOfLines={1}>
        {list.title}
      </Text>
    </Button>
  );
}

function ConversationRow({
  conversation,
  pathname,
  onOpen,
  onMenu,
  draggable = true,
}: {
  conversation: Conversation;
  pathname: string;
  onOpen: (href: string) => void;
  onMenu: (target: ConversationMenuTarget) => void;
  /** Faux dans « Récents » : le glisser-déposer n'y range rien. */
  draggable?: boolean;
}) {
  const active = pathname === `/chat/${conversation.id}`;
  // La conversation ouverte est marquée lue : ni pastille, ni gras, le temps
  // que l'écran s'en charge.
  const unread = active ? 0 : conversation.unreadCount;
  const dragRef = useConversationDragSource(draggable ? conversation.id : null);

  return (
    // La poignée de déplacement est portée par une vue et non par le bouton :
    // c'est elle qui reçoit la référence DOM, et le bouton garde la sienne pour
    // l'appui.
    <View ref={dragRef} className={selected("group flex-row items-center rounded-md", active)}>
      <Button
        variant="ghost"
        size="sm"
        onPress={() => onOpen(`/chat/${conversation.id}`)}
        // L'appui long est l'équivalent tactile du clic droit : sans lui,
        // renommer une conversation serait impossible sur téléphone — le
        // glisser-déposer, lui, n'y existe pas.
        onLongPress={(event) =>
          onMenu({
            conversation,
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          })
        }
        {...contextMenuProps((x, y) => onMenu({ conversation, x, y }))}
        className="min-w-0 flex-1 justify-start gap-2 px-2"
      >
        <Icon as={MessageCircle} size={14} className="text-muted-foreground" />
        <Text className={rowLabel(active, unread > 0)} numberOfLines={1}>
          {conversation.title}
        </Text>
      </Button>

      <UnreadBadge
        count={unread}
        pendingQuestion={active ? false : conversation.hasPendingQuestion}
      />

      <RowMenuButton
        label={`Actions pour ${conversation.title}`}
        onOpen={(x, y) => onMenu({ conversation, x, y })}
      />
    </View>
  );
}

/**
 * Conversation de groupe dans « Récents ».
 *
 * Deux bulles, pour la distinguer d'une conversation personnelle. Même menu
 * que dans le dossier de l'espace : ranger, convertir en todoliste.
 */
function RecentGroupRow({
  group,
  pathname,
  onOpen,
  onMenu,
}: {
  group: Group;
  pathname: string;
  onOpen: (href: string) => void;
  onMenu: (target: ConversationMenuTarget<Group>) => void;
}) {
  const href = `/workspace/${group.workspaceId}/group/${group.id}`;
  const active = pathname === href;
  const unread = active ? 0 : group.unreadCount;

  return (
    <View className={selected("group flex-row items-center rounded-md", active)}>
      <Button
        variant="ghost"
        size="sm"
        onPress={() => onOpen(href)}
        onLongPress={(event) =>
          onMenu({ conversation: group, x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })
        }
        {...contextMenuProps((x, y) => onMenu({ conversation: group, x, y }))}
        accessibilityLabel={
          unread > 0
            ? `${group.title}, conversation partagée, ${unread} non lu(s)`
            : `${group.title}, conversation partagée`
        }
        className="min-w-0 flex-1 justify-start gap-2 px-2"
      >
        <Icon as={MessagesSquare} size={14} className="text-muted-foreground" />
        <Text className={rowLabel(active, unread > 0)} numberOfLines={1}>
          {group.title}
        </Text>
      </Button>
      <UnreadBadge count={unread} />
      <RowMenuButton
        label={`Actions pour ${group.title}`}
        onOpen={(x, y) => onMenu({ conversation: group, x, y })}
      />
    </View>
  );
}

/** Date du dernier message, ou de la création s'il n'y en a pas encore. */
function activityTime(lastMessageAt: string | null, createdAt: string): number {
  const parsed = Date.parse(lastMessageAt ?? createdAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}
