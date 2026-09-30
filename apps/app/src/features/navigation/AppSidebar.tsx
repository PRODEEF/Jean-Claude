import { useRef, useState, type ReactNode } from "react";
import { PanResponder, ScrollView, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "expo-router";
import { vars } from "nativewind";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  Flag,
  Folder as FolderIcon,
  Inbox,
  ListChecks,
  MessageCircle,
  PanelLeft,
  Plus,
  FileText,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import { ApiError } from "@jc/api-client";
import type { Conversation, Folder, FolderTreeNode, TaskList } from "@jc/domain";
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
import { CreateGroupDialog } from "@/features/group/CreateGroupDialog";
import { useHasWorkspaceFiles } from "@/features/workspace/hooks/use-workspace-files";
import { useActiveWorkspaceId } from "@/features/workspace/hooks/use-active-workspace";
import { WorkspaceSidebarBody } from "@/features/workspace/WorkspaceSidebarBody";
import { WorkspaceSwitcher } from "@/features/workspace/WorkspaceSwitcher";
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
import { Text } from "@/shared/ui/text";
import { useCurrentUser } from "@/shared/hooks/use-current-user";
import { cn } from "@/shared/lib/utils";
import { useAssistantName, useProfile } from "@/shared/hooks/use-profile";
import { useTheme } from "@/shared/providers/theme-provider";
import { useSidebarData, type SidebarGroup } from "./use-sidebar-data";
import {
  contextMenuProps,
  NewConversationRow,
  RowMenuButton,
  rowLabel,
  SectionLabel,
  selected,
  UnreadBadge,
} from "./SidebarSection";
import { toggleSidebarLayout, useSidebarLayout } from "./use-sidebar-layout";
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
  /** Masque la barre depuis son propre en-tête — utilisé sans bannière. */
  onCollapse?: () => void;
};

/** Calendrier puis listes : l'ordre de l'en-tête de la nouvelle navigation. */
const MODERN_SHORTCUTS = ["/calendar", "/todo"].flatMap((href) =>
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
  const modern = useSidebarLayout() === "modern";
  const { displayName, initials } = useCurrentUser();
  const [searching, setSearching] = useState(false);
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
  const [creatingGroup, setCreatingGroup] = useState(false);
  /** Espace collaboratif ouvert ; `null` dans l'espace personnel. */
  const activeWorkspaceId = useActiveWorkspaceId(pathname);
  const hasFiles = useHasWorkspaceFiles(activeWorkspaceId);
  const filesHref = `/workspace/${activeWorkspaceId ?? ""}/files`;

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

  // Le canal permanent (A.10) en tête, hors de la liste qui défile : il n'est
  // pas une conversation parmi d'autres, et doit rester à portée quel que soit
  // le nombre de dossiers et de conversations.
  const channelButton = (
    <Button
      variant="ghost"
      onPress={() => go("/assistant")}
      accessibilityLabel={`Ouvrir le fil permanent avec ${assistantName}`}
      className={selected("h-auto justify-start gap-3 px-2 py-2", pathname === "/assistant")}
    >
      <View className="size-8 items-center justify-center rounded-md bg-primary">
        <Icon as={MessageCircle} size={16} className="text-primary-foreground" />
      </View>
      <Text className="flex-1 text-sm" numberOfLines={1}>
        <Text className="font-semibold text-foreground">{assistantName}</Text>
        <Text className="font-normal text-muted-foreground"> - Canal permanent</Text>
      </Text>
      <UnreadBadge
        count={pathname === "/assistant" ? 0 : (channel?.unreadCount ?? 0)}
        pendingQuestion={pathname === "/assistant" ? false : (channel?.hasPendingQuestion ?? false)}
      />
    </Button>
  );

  // Même bouton dans les deux espaces : dans un espace collaboratif, il ouvre
  // la création d'une conversation partagée.
  const newConversationButton = (
    <Button
      variant="outline"
      onPress={() => (activeWorkspaceId ? setCreatingGroup(true) : go("/chat"))}
      accessibilityLabel="Démarrer une nouvelle conversation"
      className="justify-start gap-2"
    >
      <Icon as={Plus} size={16} />
      <Text>Nouvelle conversation</Text>
    </Button>
  );

  // Serrées comme la liste du bas de la barre : ce sont deux entrées d'une même
  // liste, pas deux blocs. « Fichiers » reste hors de la zone qui défile : ce
  // n'est ni un dossier ni une conversation, mais ce qu'elles contiennent. Rien
  // à montrer tant que l'espace n'a aucun fichier.
  const workspaceLinks = activeWorkspaceId ? (
    <View className="gap-0.5">
      <NavRow
        icon={Users}
        label="Membres et invitations"
        active={pathname === `/workspace/${activeWorkspaceId}`}
        onPress={() => go(`/workspace/${activeWorkspaceId}`)}
      />
      {hasFiles || pathname === filesHref ? (
        <NavRow
          icon={FileText}
          label="Fichiers"
          accessibilityLabel="Fichiers de l'espace"
          active={pathname === filesHref}
          onPress={() => go(filesHref)}
        />
      ) : null}
    </View>
  ) : null;

  const adminLink = isAdmin ? (
    <NavRow
      icon={Inbox}
      label="Retours des testeurs"
      active={pathname === "/feedback"}
      onPress={() => go("/feedback")}
    />
  ) : null;

  return (
    <View
      className="h-full border-r border-border bg-secondary"
      // Le fond de survol et de sélection de shadcn (`accent`) est le gris de
      // `surface` — celui de la barre elle-même. La rangée active s'y fondait :
      // rien ne montrait que le calendrier était ouvert. Il est foncé ici, pour
      // la barre seulement ; ailleurs, il se pose sur le fond blanc de l'écran.
      style={[{ width }, vars({ "--accent": palette.border })]}
    >
      {modern ? (
        <View className="gap-2 p-3">
          {/* Replier et chercher en tête de barre, comme Claude et ChatGPT
              (§4.2) : sans bannière, c'est là que ces deux gestes se retrouvent. */}
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

          {/* Quatre rangées au même format — icône et libellé en couleur de
              texte — pour se lire comme une seule liste ; seul le nom de
              l'assistant ressort, en gras. */}
          <View className="gap-0.5">
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
            {/* Signalement direct, distinct des suggestions du modèle (§12.1) :
                un geste utilisateur, jamais une proposition (A.10). */}
            <NavRow
              icon={Flag}
              iconClassName="text-foreground"
              label="Signaler un problème"
              active={false}
              onPress={() => setFeedbackOpen(true)}
            />
            {/* La revue des signalements n'existe que pour l'équipe. */}
            {isAdmin ? (
              <NavRow
                icon={Inbox}
                iconClassName="text-foreground"
                label="Retours des testeurs"
                active={pathname === "/feedback"}
                onPress={() => go("/feedback")}
              />
            ) : null}
            {MODERN_SHORTCUTS.map((link) => (
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
              icon={Plus}
              iconClassName="text-foreground"
              label="Nouvelle conversation"
              accessibilityLabel="Démarrer une nouvelle conversation"
              active={false}
              onPress={() => (activeWorkspaceId ? setCreatingGroup(true) : go("/chat"))}
            />
            <WorkspaceSwitcher
              activeWorkspaceId={activeWorkspaceId}
              onNavigate={go}
              appearance="row"
            />
          </View>

          {workspaceLinks}
        </View>
      ) : (
        <View className="gap-2 p-3">
          {/* Signalement direct, distinct des suggestions du modèle (§12.1) : un
              geste utilisateur, jamais une proposition (A.10). Même traitement
              visuel que le canal permanent, en rouge, pour rester aussi visible. */}
          <Button
            variant="ghost"
            onPress={() => setFeedbackOpen(true)}
            accessibilityLabel="Signaler un problème"
            className="h-auto justify-start gap-3 px-2 py-2"
          >
            <View className="size-8 items-center justify-center rounded-md bg-destructive">
              <Icon as={MessageCircle} size={16} className="text-white" />
            </View>
            <Text className="text-sm font-semibold text-foreground">SIGNALER UN PROBLÈME</Text>
          </Button>

          {channelButton}

          {/* Sous le canal, hors de la zone qui défile : le canal et le signalement
              restent au-dessus de l'espace, car ils ne dépendent pas de lui. */}
          <WorkspaceSwitcher activeWorkspaceId={activeWorkspaceId} onNavigate={go} />

          {newConversationButton}

          {workspaceLinks}
        </View>
      )}

      {activeWorkspaceId ? (
        <WorkspaceSidebarBody workspaceId={activeWorkspaceId} pathname={pathname} onNavigate={go} />
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="px-3 pb-4">
          {/* L'en-tête fait office de zone racine : y déposer un dossier le sort
            de son parent. Sans elle, le geste serait à sens unique — on saurait
            ranger un dossier, jamais l'en ressortir. */}
          <View ref={rootDropRef} className={cx("rounded-md", isOverRoot)}>
            <SectionLabel action={{ label: "Créer un dossier", onPress: createRootFolder }}>
              Dossiers
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

          {groups.map((group) => (
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
          ))}

          {naming?.kind === "create" && naming.parentId === null ? (
            <FolderNameRow target={naming} onDone={() => setNaming(null)} />
          ) : null}

          {/* Conversations et tâches : toutes les conversations à plat, y compris
            celles déjà rangées dans un dossier. Ce n'est pas une duplication :
            la même conversation reste visible depuis son dossier, ci-dessus, et
            depuis cette vue chronologique (§5.2, A.1). Les conversations non
            rangées, elles, n'apparaissent plus qu'ici — une section « Sans
            dossier » à part aurait fait doublon avec cette liste, qui les
            contient déjà. */}
          <SectionLabel>Conversations et tâches</SectionLabel>

          {all.map((conversation) =>
            renaming?.id === conversation.id ? (
              <ConversationNameRow
                key={conversation.id}
                conversation={conversation}
                onDone={() => setRenaming(null)}
              />
            ) : (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                pathname={pathname}
                onOpen={go}
                onMenu={setConversationMenu}
              />
            ),
          )}
        </ScrollView>
      )}

      <Separator />

      {modern ? (
        <View className="gap-0.5 p-3">
          {/* Le profil en pied de barre, qui ouvre les réglages : Claude,
              ChatGPT et Slack le placent tous là (§4.2). */}
          <View className="flex-row items-center gap-1 pt-2">
            <Button
              variant="ghost"
              onPress={() => go("/settings")}
              accessibilityLabel={`Ouvrir les réglages de ${displayName}`}
              className={selected(
                "h-auto min-w-0 flex-1 justify-start gap-3 px-2 py-2",
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
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onPress={toggleSidebarLayout}
              accessibilityLabel="Revenir à l'ancienne navigation"
            >
              <Icon as={ArrowLeftRight} size={16} className="text-muted-foreground" />
            </Button>
          </View>
        </View>
      ) : (
        <View className="gap-0.5 p-3">
          {UTILITY_LINKS.map((link) => (
            <NavRow
              key={link.href}
              icon={link.icon}
              label={link.label}
              active={pathname === link.href}
              onPress={() => go(link.href)}
            />
          ))}

          {/* Hors de `UTILITY_LINKS` : la bannière les reprend pour tous, alors
              que la revue n'existe que pour l'équipe. */}
          {adminLink}

          <NavRow
            icon={ArrowLeftRight}
            label="Essayer la nouvelle navigation"
            active={false}
            onPress={toggleSidebarLayout}
          />
        </View>
      )}

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
      <CreateGroupDialog
        workspaceId={creatingGroup ? activeWorkspaceId : null}
        onClose={() => setCreatingGroup(false)}
        onCreated={(group) => {
          setCreatingGroup(false);
          go(`/workspace/${group.workspaceId}/group/${group.id}`);
        }}
      />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      {modern ? (
        <SearchDialog
          open={searching}
          onClose={() => setSearching(false)}
          onSelect={(conversation) => {
            setSearching(false);
            go(`/chat/${conversation.id}`);
          }}
        />
      ) : null}

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
        className={cn(
          "flex-1 text-sm text-foreground",
          active ? "font-medium" : "font-normal",
        )}
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
  const isEmpty = isFolderEmpty(group);
  // Un dossier est « courant » quand la conversation ouverte est chez lui ou
  // chez l'un de ses descendants : c'est la seule sélection qu'un dossier
  // puisse avoir, n'étant pas lui-même une destination.
  const active = containsPath(group, pathname);
  // Un dossier vide s'ouvre sur la seule mention « Vide » : le déplier par
  // défaut allongerait la barre sans rien apprendre.
  const [open, setOpen] = useState(!isEmpty);
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
              {/* Chevron permanent, devant l'icône de dossier. Il ne
                s'affichait qu'au survol, à sa place : au doigt, où rien ne
                survole, on ne voyait jamais qu'un dossier se déplie, et à la
                souris il fallait le chercher. Signalé en usage réel. La largeur
                prise au nom est le prix de ce repère toujours visible. */}
              <View className="flex-row items-center gap-1">
                <Icon
                  as={open || drafting ? ChevronDown : ChevronRight}
                  size={14}
                  className="text-muted-foreground"
                />
                <Icon as={FolderIcon} size={16} className="text-muted-foreground" />
              </View>
              <Text className={rowLabel(active)} numberOfLines={1}>
                {group.folder.name}
              </Text>
            </Button>
          </CollapsibleTrigger>

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
}: {
  conversation: Conversation;
  pathname: string;
  onOpen: (href: string) => void;
  onMenu: (target: ConversationMenuTarget) => void;
}) {
  const active = pathname === `/chat/${conversation.id}`;
  const dragRef = useConversationDragSource(conversation.id);

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
        className="min-w-0 flex-1 justify-start px-2"
      >
        <Text className={rowLabel(active)} numberOfLines={1}>
          {conversation.title}
        </Text>
      </Button>

      <UnreadBadge
        count={active ? 0 : conversation.unreadCount}
        pendingQuestion={active ? false : conversation.hasPendingQuestion}
      />

      <RowMenuButton
        label={`Actions pour ${conversation.title}`}
        onOpen={(x, y) => onMenu({ conversation, x, y })}
      />
    </View>
  );
}
