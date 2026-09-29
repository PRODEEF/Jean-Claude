import { View } from "react-native";
import { Plus } from "lucide-react-native";
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
