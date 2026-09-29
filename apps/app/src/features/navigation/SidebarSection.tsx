import { Platform, View } from "react-native";
import { MoreHorizontal, Plus } from "lucide-react-native";
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
