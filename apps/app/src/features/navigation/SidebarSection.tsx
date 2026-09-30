import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  MoreHorizontal,
  Plus,
} from "lucide-react-native";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";

/**
 * Éléments de rangée partagés par la barre de l'espace personnel et celle d'un
 * espace collaboratif : les deux doivent avoir exactement la même structure,
 * donc le même rendu.
 */

/**
 * Surligne la rangée de la route courante (demande de Yann).
 *
 * `bg-accent-soft` et non le `bg-accent` de shadcn : celui-ci est le gris du
 * survol, et la conversation ouverte se confondrait avec celle que le curseur
 * ne fait que traverser — la confusion déjà corrigée dans la bannière. La
 * teinte atténuée de l'assistant est celle de la bulle de l'utilisateur :
 * visible dans les deux thèmes, et qui suit la couleur choisie dans les
 * réglages.
 */
export function selected(base: string, active: boolean): string {
  return active ? `${base} bg-accent-soft` : base;
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
export function rowLabel(active: boolean): string {
  return active
    ? "flex-1 text-sm font-medium text-foreground"
    : "flex-1 text-sm font-normal text-muted-foreground";
}

export function SectionLabel({
  children,
  action,
  collapse,
}: {
  children: string;
  action?: { label: string; onPress: () => void };
  /** Rend le titre repliable — nouvelle navigation uniquement. */
  collapse?: { open: boolean; onToggle: () => void };
}) {
  return (
    <View className="flex-row items-center justify-between pb-1 pt-3">
      {collapse ? (
        // Le titre entier replie la section, comme les « Starred » et
        // « Recents » de Claude (§4.2). Le chevron reste visible : au doigt,
        // rien d'autre ne dirait que le titre se touche.
        <Button
          variant="ghost"
          size="sm"
          onPress={collapse.onToggle}
          hitSlop={4}
          accessibilityLabel={collapse.open ? `Replier ${children}` : `Déplier ${children}`}
          accessibilityState={{ expanded: collapse.open }}
          className="h-auto gap-1 px-2 py-1"
        >
          <Text className="text-xs font-medium text-muted-foreground">{children}</Text>
          <Icon
            as={collapse.open ? ChevronDown : ChevronRight}
            size={12}
            className="text-muted-foreground"
          />
        </Button>
      ) : (
        <Text className="px-2 text-xs font-medium text-muted-foreground">{children}</Text>
      )}
      {action ? <RowAction icon={Plus} label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

/**
 * Conversations affichées d'emblée dans « Récents », puis à chaque « Afficher
 * plus » — nouvelle navigation uniquement. Au-delà d'une vingtaine, la section
 * repousse le pied de barre sans rien apporter : on y cherche une conversation
 * récente, les autres se retrouvent par la recherche.
 */
export const RECENT_PAGE_SIZE = 20;

/** Dévoile la tranche suivante de « Récents ». */
export function ShowMoreRow({ onPress }: { onPress: () => void }) {
  return (
    <Button variant="ghost" size="sm" onPress={onPress} className="justify-start gap-2 px-2">
      <Icon as={Plus} size={14} className="text-muted-foreground" />
      <Text className="text-xs font-normal text-muted-foreground">Afficher plus</Text>
    </Button>
  );
}

const SECTION_STORAGE_PREFIX = "jc.sidebar-section.";

/**
 * Section repliable de la barre, dépliée tant que l'utilisateur ne l'a pas
 * repliée. Mémorisé sur l'appareil, comme le choix de navigation : c'est une
 * préférence d'affichage, sans valeur d'un appareil à l'autre.
 */
export function useSectionOpen(section: "folders" | "conversations"): [boolean, () => void] {
  const [open, setOpen] = useState(true);
  const key = `${SECTION_STORAGE_PREFIX}${section}`;

  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((stored) => {
        if (stored === "closed") setOpen(false);
      })
      // Stockage indisponible (navigation privée) : la section reste dépliée.
      .catch(() => undefined);
  }, [key]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    AsyncStorage.setItem(key, next ? "open" : "closed").catch(() => undefined);
  };

  return [open, toggle];
}

/**
 * Le pointeur peut-il survoler ? Faux au doigt, y compris dans un navigateur
 * de téléphone — `Platform.OS` ne suffit pas à le dire.
 */
function canHover(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  return window.matchMedia?.("(hover: hover)").matches ?? false;
}

/**
 * Icône d'une rangée de dossier.
 *
 * Ancienne navigation : chevron permanent devant l'icône de dossier.
 * Nouvelle navigation : l'icône de dossier seule, que le chevron remplace au
 * survol — la rangée gagne la largeur du chevron. Sans survol possible, le
 * chevron seul, en permanence : c'est lui qui dit qu'un dossier se déplie, le
 * problème déjà signalé en usage réel quand il n'apparaissait qu'au survol.
 */
export function FolderToggleIcon({ open, modern }: { open: boolean; modern: boolean }) {
  const chevron = open ? ChevronDown : ChevronRight;

  if (!modern) {
    return (
      <View className="flex-row items-center gap-1">
        <Icon as={chevron} size={14} className="text-muted-foreground" />
        <Icon as={FolderIcon} size={16} className="text-muted-foreground" />
      </View>
    );
  }

  if (!canHover()) {
    return (
      <View className="size-4 items-center justify-center">
        <Icon as={chevron} size={14} className="text-muted-foreground" />
      </View>
    );
  }

  // Les deux icônes superposées, basculées par opacité : la rangée garde la
  // même largeur, et le libellé ne saute pas au passage du curseur.
  return (
    <View className="size-4 items-center justify-center">
      <View className="group-hover:opacity-0">
        <Icon as={FolderIcon} size={16} className="text-muted-foreground" />
      </View>
      <View className="absolute inset-0 items-center justify-center opacity-0 group-hover:opacity-100">
        <Icon as={chevron} size={14} className="text-muted-foreground" />
      </View>
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
 * Pastille de non-lu — messages de l'assistant depuis la dernière ouverture,
 * ou un « ? » quand une question reste sans réponse malgré une ouverture déjà
 * faite (0 message non lu au sens strict, mais rien n'y a répondu).
 */
export function UnreadBadge({
  count,
  pendingQuestion = false,
}: {
  count: number;
  pendingQuestion?: boolean;
}) {
  if (count === 0 && !pendingQuestion) return null;

  return (
    <View
      className="min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5"
      style={{ height: 18 }}
    >
      <Text className="text-[10px] font-semibold leading-none text-primary-foreground">
        {count > 0 ? count : "?"}
      </Text>
    </View>
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
export function RowMenuButton({
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

export function contextMenuProps(open: (x: number, y: number) => void): WebContextMenuProps {
  if (Platform.OS !== "web") return {};
  return {
    onContextMenu: (event) => {
      event.preventDefault();
      open(event.clientX, event.clientY);
    },
  };
}

/**
 * Ce que montre un dossier vide.
 *
 * « Vide » constatait sans rien proposer. L'invitation à écrire, elle, range la
 * conversation dans ce dossier d'entrée de jeu : c'est le seul endroit où le
 * choix du rangement précède la capture (§13.4.1), et il ne demande rien —
 * l'utilisateur l'a déjà exprimé en partant de ce dossier.
 */
export function NewConversationRow({ onPress }: { onPress: () => void }) {
  return (
    <Button variant="ghost" size="sm" onPress={onPress} className="justify-start gap-2 px-2">
      <Icon as={Plus} size={14} className="text-muted-foreground" />
      <Text className="text-xs font-normal text-muted-foreground">Nouvelle conversation</Text>
    </Button>
  );
}
