import { useRef, useState } from "react";
import { PanResponder, Platform, ScrollView, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "expo-router";
import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  Plus,
  Sparkles,
} from "lucide-react-native";
import type { Conversation, Folder } from "@jc/domain";
import { api } from "@/shared/lib/api";
import { FolderContextMenu, type FolderMenuTarget } from "@/features/folder/FolderContextMenu";
import { FolderDeleteDialog } from "@/features/folder/FolderDeleteDialog";
import { FolderNameRow, type FolderNameTarget } from "@/features/folder/FolderNameRow";
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
  const { groups, unfiled, isLoading, error } = useSidebarData();
  const [deleting, setDeleting] = useState<Folder | null>(null);
  const [menuTarget, setMenuTarget] = useState<FolderMenuTarget | null>(null);
  /** Dossier en cours de nommage — création ou renommage, `null` si aucun. */
  const [naming, setNaming] = useState<FolderNameTarget | null>(null);

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
            <Icon as={Sparkles} size={16} className="text-primary-foreground" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground">{assistantName}</Text>
            <Text className="text-xs text-muted-foreground">Canal permanent</Text>
          </View>
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
        <SectionLabel action={{ label: "Créer un dossier", onPress: createRootFolder }}>
          Dossiers
        </SectionLabel>

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
            <Text className="text-xs text-muted-foreground">Créer un premier dossier</Text>
          </Button>
        ) : null}

        {groups.map((group) => (
          <FolderGroup
            key={group.folder.id}
            group={group}
            depth={1}
            pathname={pathname}
            naming={naming}
            onOpen={go}
            onMenu={setMenuTarget}
            onCloseNaming={() => setNaming(null)}
            onNewConversation={(folderId) => create.mutate([folderId])}
          />
        ))}

        {naming?.kind === "create" && naming.parentId === null ? (
          <FolderNameRow target={naming} onDone={() => setNaming(null)} />
        ) : null}

        {unfiled.length > 0 ? (
          <>
            <SectionLabel>Sans dossier</SectionLabel>
            {unfiled.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                pathname={pathname}
                onOpen={go}
              />
            ))}
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
            <Text className="text-sm text-foreground">{link.label}</Text>
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
        onDelete={({ folder }) => {
          setMenuTarget(null);
          setDeleting(folder);
        }}
      />

      <FolderDeleteDialog folder={deleting} onClose={() => setDeleting(null)} />

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
 */
function rowLabel(active: boolean): string {
  return active
    ? "flex-1 text-sm font-medium text-foreground"
    : "flex-1 text-sm text-muted-foreground";
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
  onOpen,
  onMenu,
  onCloseNaming,
  onNewConversation,
}: {
  group: SidebarGroup;
  depth: number;
  pathname: string;
  /** Dossier en cours de nommage, où qu'il soit dans l'arborescence. */
  naming: FolderNameTarget | null;
  onOpen: (href: string) => void;
  onMenu: (target: FolderMenuTarget) => void;
  onCloseNaming: () => void;
  onNewConversation: (folderId: string) => void;
}) {
  const isEmpty = group.conversations.length === 0 && group.children.length === 0;
  // Un dossier est « courant » quand la conversation ouverte est chez lui ou
  // chez l'un de ses descendants : c'est la seule sélection qu'un dossier
  // puisse avoir, n'étant pas lui-même une destination.
  const active = containsPath(group, pathname);
  // Un dossier vide s'ouvre sur la seule mention « Vide » : le déplier par
  // défaut allongerait la barre sans rien apprendre.
  const [open, setOpen] = useState(!isEmpty);
  const [hovered, setHovered] = useState(false);
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
            onOpen={onOpen}
            onMenu={onMenu}
            onCloseNaming={onCloseNaming}
            onNewConversation={onNewConversation}
          />
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <Collapsible open={open || drafting} onOpenChange={setOpen}>
      <View className="flex-row items-center">
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
      </View>

      <CollapsibleContent>
        <FolderChildren
          group={group}
          depth={depth}
          pathname={pathname}
          naming={naming}
          onOpen={onOpen}
          onMenu={onMenu}
          onCloseNaming={onCloseNaming}
          onNewConversation={onNewConversation}
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
  onOpen,
  onMenu,
  onCloseNaming,
  onNewConversation,
}: {
  group: SidebarGroup;
  depth: number;
  pathname: string;
  naming: FolderNameTarget | null;
  onOpen: (href: string) => void;
  onMenu: (target: FolderMenuTarget) => void;
  onCloseNaming: () => void;
  onNewConversation: (folderId: string) => void;
}) {
  const isEmpty = group.conversations.length === 0 && group.children.length === 0;
  const drafting = naming?.kind === "create" && naming.parentId === group.folder.id;

  return (
    // Le filet vertical est ce qui rattache visuellement les conversations à
    // leur dossier, comme dans le bloc shadcn. Il se répète à chaque niveau :
    // au 5e, la barre est très entamée à gauche et les libellés se tronquent —
    // le retrait reste plus lisible qu'un aplatissement qui perdrait la
    // filiation.
    <View className="ml-4 border-l border-border pl-2">
      {group.conversations.map((conversation) => (
        <ConversationRow
          key={conversation.id}
          conversation={conversation}
          pathname={pathname}
          onOpen={onOpen}
        />
      ))}

      {group.children.map((child) => (
        <FolderGroup
          key={child.folder.id}
          group={child}
          depth={depth + 1}
          pathname={pathname}
          naming={naming}
          onOpen={onOpen}
          onMenu={onMenu}
          onCloseNaming={onCloseNaming}
          onNewConversation={onNewConversation}
        />
      ))}

      {drafting && naming ? <FolderNameRow target={naming} onDone={onCloseNaming} /> : null}

      {isEmpty && !drafting ? (
        <NewConversationRow onPress={() => onNewConversation(group.folder.id)} />
      ) : null}
    </View>
  );
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
      <Text className="text-xs text-muted-foreground">Nouvelle conversation</Text>
    </Button>
  );
}

function ConversationRow({
  conversation,
  pathname,
  onOpen,
}: {
  conversation: Conversation;
  pathname: string;
  onOpen: (href: string) => void;
}) {
  const active = pathname === `/chat/${conversation.id}`;

  return (
    <Button
      variant="ghost"
      size="sm"
      onPress={() => onOpen(`/chat/${conversation.id}`)}
      className={cx("w-full justify-start px-2", active)}
    >
      <Text className={rowLabel(active)} numberOfLines={1}>
        {conversation.title}
      </Text>
    </Button>
  );
}
