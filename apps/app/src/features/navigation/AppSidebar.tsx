import { useRef, useState } from "react";
import { PanResponder, Platform, ScrollView, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "expo-router";
import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  ListChecks,
  MessageCircle,
  MoreHorizontal,
  Plus,
} from "lucide-react-native";
import type { Conversation, Folder, FolderTreeNode, TaskList } from "@jc/domain";
import { api } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
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
import { FolderContextMenu, type FolderMenuTarget } from "@/features/folder/FolderContextMenu";
import { FolderDeleteDialog } from "@/features/folder/FolderDeleteDialog";
import { moveErrorMessage, useFolderActions } from "@/features/folder/hooks/use-folder-actions";
import { FolderNameRow, type FolderNameTarget } from "@/features/folder/FolderNameRow";
import { TaskListDialog, type TaskListTarget } from "@/features/todo/TaskListDialog";
import {
  useConversationDragSource,
  useFolderDragSource,
  useFolderDropTarget,
} from "./sidebar-drag";
import { Button } from "@/shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import { Icon } from "@/shared/ui/icon";
import { Separator } from "@/shared/ui/separator";
import { Text } from "@/shared/ui/text";
import { useAssistantName } from "@/shared/hooks/use-profile";
import { useSidebarData, type SidebarGroup } from "./use-sidebar-data";
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
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 420;

export type AppSidebarProps = {
  /** Referme le tiroir après navigation — sans effet quand la barre est fixe. */
  onNavigate?: () => void;
  /** Largeur courante ; le parent la détient pour qu'elle survive au repli. */
  width?: number;
  /** Fourni uniquement quand la barre est fixe : le tiroir ne se redimensionne pas. */
  onResize?: (width: number) => void;
};

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
}: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const assistantName = useAssistantName();
  const { groups, unfiled, all, isLoading, error } = useSidebarData();
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { move } = useFolderActions();

  const go = (href: string) => {
    router.push(href as never);
    onNavigate?.();
  };

  /**
   * Capture sans friction (§13.4.1) : la conversation naît sans qu'on demande
   * où la ranger. Le classement vient après, jamais avant.
   */
  const create = useMutation({
    mutationFn: (folderIds: string[]) => api.conversations.create({ folderIds }),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      go(`/chat/${conversation.id}`);
    },
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

  return (
    <View className="h-full border-r border-border bg-secondary" style={{ width }}>
      <View className="gap-2 p-3">
        {/* Canal permanent Jean-Claude (A.10) : borné aux rappels, à
            l'organisation de l'outil et à la structure du projet. Il tient la
            place de l'en-tête de la barre parce qu'il n'est pas une
            conversation parmi d'autres. */}
        <Button
          variant="ghost"
          onPress={() => go("/assistant")}
          accessibilityLabel={`Ouvrir le fil permanent avec ${assistantName}`}
          className={cx("h-auto justify-start gap-3 px-2 py-2", pathname === "/assistant")}
        >
          <View className="size-8 items-center justify-center rounded-md bg-primary">
            <Icon as={MessageCircle} size={16} className="text-primary-foreground" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground">{assistantName}</Text>
            <Text className="text-xs font-normal text-muted-foreground">Canal permanent</Text>
          </View>
        </Button>

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
          <Text className="text-sm font-semibold text-foreground">PROBLÈME</Text>
        </Button>

        <Button
          variant="outline"
          onPress={() => create.mutate([])}
          disabled={create.isPending}
          accessibilityLabel="Démarrer une nouvelle conversation"
          className="justify-start gap-2"
        >
          <Icon as={Plus} size={16} />
          <Text>Nouvelle conversation</Text>
        </Button>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-3 pb-4">
        {/* L'en-tête fait office de zone racine : y déposer un dossier le sort
            de son parent. Sans elle, le geste serait à sens unique — on saurait
            ranger un dossier, jamais l'en ressortir. */}
        <View ref={rootDropRef} className={cx("rounded-md", isOverRoot)}>
          <SectionLabel action={{ label: "Créer un dossier", onPress: createRootFolder }}>
            Dossiers
          </SectionLabel>
        </View>

        {moveError ? <Text className="text-destructive px-2 py-1 text-xs">{moveError}</Text> : null}

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
            onNewConversation={(folderId) => create.mutate([folderId])}
            onConversationMenu={setConversationMenu}
            onCloseRenaming={() => setRenaming(null)}
            onDropConversation={dropOnFolder}
            onDropFolder={moveFolder}
          />
        ))}

        {naming?.kind === "create" && naming.parentId === null ? (
          <FolderNameRow target={naming} onDone={() => setNaming(null)} />
        ) : null}

        {unfiled.length > 0 ? (
          <>
            <SectionLabel>Sans dossier</SectionLabel>
            {unfiled.map((conversation) =>
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
          </>
        ) : null}
      </ScrollView>

      <Separator />

      <View className="gap-0.5 p-3">
        {UTILITY_LINKS.map((link) => (
          <Button
            key={link.href}
            variant="ghost"
            onPress={() => go(link.href)}
            className={cx("justify-start gap-3 px-2", pathname === link.href)}
          >
            <Icon as={link.icon} size={16} className="text-muted-foreground" />
            <Text
              className={
                pathname === link.href
                  ? "text-sm font-medium text-foreground"
                  : "text-sm font-normal text-foreground"
              }
            >
              {link.label}
            </Text>
          </Button>
        ))}
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
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

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

/**
 * Ouverture au clic droit.
 *
 * `onContextMenu` est transmis par react-native-web mais absent des types
 * React Native, qui ne décrivent que le tactile : il est donc déclaré ici, et
 * n'est posé que sur web — ailleurs il n'existe pas d'événement à recevoir.
 * `preventDefault` évite que le menu du navigateur se superpose au nôtre.
 */
type WebContextMenuProps = {
  onContextMenu?: (event: { preventDefault: () => void; clientX: number; clientY: number }) => void;
};

function contextMenuProps(open: (x: number, y: number) => void): WebContextMenuProps {
  if (Platform.OS !== "web") return {};
  return {
    onContextMenu: (event) => {
      event.preventDefault();
      open(event.clientX, event.clientY);
    },
  };
}

/** Ajoute le fond de survol shadcn quand la rangée est celle de la route courante. */
function cx(base: string, active: boolean): string {
  return active ? `${base} bg-accent` : base;
}

/**
 * Libellé d'une rangée de la barre : gris tant que la sélection est ailleurs,
 * pour que l'œil trouve d'un coup la branche ouverte au milieu de
 * l'arborescence. Dossiers et conversations suivent la même règle.
 *
 * `font-normal` est explicite et non omis : `Button` publie `font-medium` par
 * son `TextClassContext`, dont toute rangée hériterait sinon — l'arborescence
 * entière paraissait alors sélectionnée.
 */
function rowLabel(active: boolean): string {
  return active
    ? "flex-1 text-sm font-medium text-foreground"
    : "flex-1 text-sm font-normal text-muted-foreground";
}

function SectionLabel({
  children,
  action,
}: {
  children: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View className="flex-row items-center justify-between pb-1 pt-3">
      <Text className="px-2 text-xs font-medium text-muted-foreground">{children}</Text>
      {action ? <RowAction icon={Plus} label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

/**
 * Bouton d'action d'une rangée.
 *
 * 32 pt de côté pour ne pas épaissir la barre, plus 8 pt de `hitSlop` de
 * chaque côté : la zone réellement touchable atteint les 44 pt de
 * `MIN_TOUCH_TARGET` sans que la rangée ne grandisse.
 */
function RowAction({
  icon,
  label,
  onPress,
}: {
  icon: typeof Plus;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={label}
      className="size-8"
    >
      <Icon as={icon} size={16} className="text-muted-foreground" />
    </Button>
  );
}

/**
 * Le menu d'une rangée, atteignable à la souris.
 *
 * Le clic droit reste le geste principal, mais il ne s'apprend pas : rien
 * n'indique qu'une rangée en porte un. Ce bouton le montre au survol, et ouvre
 * exactement le même menu — c'est ce que font Notion et Apple Notes (§4.2).
 *
 * Web seulement, et l'opacité plutôt que le montage : un bouton qui
 * n'existerait qu'au survol de la rangée disparaîtrait à l'instant où le
 * curseur le vise. Au doigt, où il n'y a pas de survol, il volerait 32 pt au
 * nom de la conversation — l'appui long y tient déjà ce rôle.
 */
function RowMenuButton({
  label,
  onOpen,
}: {
  label: string;
  onOpen: (x: number, y: number) => void;
}) {
  if (Platform.OS !== "web") return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      hitSlop={8}
      onPress={(event) => onOpen(event.nativeEvent.pageX, event.nativeEvent.pageY)}
      accessibilityLabel={label}
      className={cn("size-8 opacity-0", Platform.select({ web: "group-hover:opacity-100" }))}
    >
      <Icon as={MoreHorizontal} size={16} className="text-muted-foreground" />
    </Button>
  );
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
  const [hovered, setHovered] = useState(false);
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
              onHoverIn={() => setHovered(true)}
              onHoverOut={() => setHovered(false)}
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
              {/* Le chevron prend la place de l'icône de dossier au survol, il ne
                s'ajoute pas à côté : deux glyphes pour une même rangée volaient
                de la largeur au nom, déjà tronqué dès le 3e niveau. C'est le
                geste de Notion et d'Apple Notes.
                Sans souris, `onHoverIn` ne se déclenche jamais : l'icône reste
                celle du dossier, et l'état plié se lit au contenu affiché
                dessous. */}
              <Icon
                as={hovered ? (open ? ChevronDown : ChevronRight) : FolderIcon}
                size={16}
                className="text-muted-foreground"
              />
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

/** Le dossier, ou l'un de ses descendants, porte-t-il la conversation ouverte ? */
function containsPath(group: SidebarGroup, pathname: string): boolean {
  return (
    group.conversations.some((conversation) => pathname === `/chat/${conversation.id}`) ||
    group.children.some((child) => containsPath(child, pathname))
  );
}

/**
 * Ce que montre un dossier vide.
 *
 * « Vide » constatait sans rien proposer. L'invitation à écrire, elle, range la
 * conversation dans ce dossier d'entrée de jeu : c'est le seul endroit où le
 * choix du rangement précède la capture (§13.4.1), et il ne demande rien —
 * l'utilisateur l'a déjà exprimé en partant de ce dossier.
 */
function NewConversationRow({ onPress }: { onPress: () => void }) {
  return (
    <Button variant="ghost" size="sm" onPress={onPress} className="justify-start gap-2 px-2">
      <Icon as={Plus} size={14} className="text-muted-foreground" />
      <Text className="text-xs font-normal text-muted-foreground">Nouvelle conversation</Text>
    </Button>
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
    <View ref={dragRef} className={cx("group flex-row items-center rounded-md", active)}>
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

      <RowMenuButton
        label={`Actions pour ${conversation.title}`}
        onOpen={(x, y) => onMenu({ conversation, x, y })}
      />
    </View>
  );
}
