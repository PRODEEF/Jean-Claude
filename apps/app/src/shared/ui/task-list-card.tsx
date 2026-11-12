import type { ReactNode, Ref } from "react";
import { Platform, Pressable, View, type GestureResponderEvent } from "react-native";
import {
  CalendarClock,
  Check,
  Folder,
  GripVertical,
  ListChecks,
  MoreHorizontal,
  ShoppingBasket,
} from "lucide-react-native";
import { cn } from "@/shared/lib/utils";
import { TASK_CHECKBOX_SIZE, TASK_INDENT, TASK_ROW_HEIGHT } from "@/shared/lib/tasks";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";

/**
 * Carte d'une liste, telle que « Mes listes » et les espaces la montrent.
 *
 * Les deux écrans enregistrent différemment — « Mes listes » réécrit la liste
 * entière, un espace n'écrit que la tâche touchée pour ne pas écraser la saisie
 * d'un autre membre — mais ils doivent se ressembler au pixel près. Leur
 * apparence vit donc ici, une seule fois : modifier un espacement ou une icône
 * vaut pour les deux.
 */

/** Cadre de la carte. Resserré sur grand écran seulement : au doigt, l'espace laisse de la marge à l'erreur. */
export function TaskListCardFrame({
  children,
  desktop,
  highlighted = false,
  cardRef,
}: {
  children: ReactNode;
  desktop: boolean;
  /** Carte visée depuis la barre latérale. */
  highlighted?: boolean;
  /** Pour amener la carte à l'écran. */
  cardRef?: Ref<View>;
}) {
  return (
    <View
      ref={cardRef}
      className={cn(
        "rounded-xl border",
        desktop ? "p-2" : "p-3",
        highlighted ? "border-primary" : "border-border",
      )}
    >
      {children}
    </View>
  );
}

/**
 * En-tête : le type, le dossier, puis l'échéance et le menu.
 *
 * `leading` précède le type — le repli et le titre dans « Mes listes » ; un
 * espace n'en met pas, son titre est déjà celui de la page.
 */
export function TaskListCardHeader({
  title,
  shopping,
  folderName,
  due,
  leading,
  onFolderPress,
  onDuePress,
  onMenuPress,
  menuLabel,
}: {
  /** Pour les libellés d'accessibilité. */
  title: string;
  shopping: boolean;
  folderName: string | undefined;
  due: string | undefined;
  leading?: ReactNode;
  onFolderPress: (event: GestureResponderEvent) => void;
  onDuePress: () => void;
  onMenuPress: (event: GestureResponderEvent) => void;
  menuLabel: string;
}) {
  return (
    <View className="flex-row items-center gap-2">
      {leading}
      <Icon
        as={shopping ? ShoppingBasket : ListChecks}
        size={16}
        className="text-muted-foreground"
      />
      <Text className="text-muted-foreground shrink text-xs" numberOfLines={1}>
        {shopping ? "Liste d'achats" : "Liste de tâches"}
      </Text>

      <Pressable
        onPress={onFolderPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Dossier de ${title} : ${folderName ?? "aucun"}`}
        className="min-w-0 shrink flex-row items-center gap-1 rounded-md px-1.5 py-1"
      >
        <Icon as={Folder} size={14} className="text-muted-foreground" />
        <Text className="text-muted-foreground shrink text-xs" numberOfLines={1}>
          {folderName ?? "Dossier"}
        </Text>
      </Pressable>

      <View className="min-w-0 flex-1" />

      {/* L'échéance porte sur la liste entière : elle se lit en tête, et se
          change d'un appui. Sans date, l'invite reste visible : c'est elle qui
          la rend atteignable. */}
      <Pressable
        onPress={onDuePress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Échéance de ${title} : ${due ?? "aucune"}`}
        className="shrink-0 flex-row items-center gap-1 rounded-md px-1.5 py-1"
      >
        <Icon as={CalendarClock} size={14} className="text-muted-foreground" />
        <Text className="text-muted-foreground text-xs" numberOfLines={1}>
          {due ?? "Date"}
        </Text>
      </Pressable>

      <Button
        variant="ghost"
        size="icon"
        hitSlop={8}
        onPress={onMenuPress}
        accessibilityLabel={menuLabel}
        className="size-8"
      >
        <Icon as={MoreHorizontal} size={16} className="text-muted-foreground" />
      </Button>
    </View>
  );
}

/** Zone des lignes, sous l'en-tête. */
export function TaskListCardBody({ children, desktop }: { children: ReactNode; desktop: boolean }) {
  return <View className={cn("gap-0.5", desktop ? "pt-1.5" : "pt-2")}>{children}</View>;
}

/** Mesures d'une ligne : sa hauteur, et son retrait quand c'est une sous-tâche. */
export function taskRowStyle(depth: 0 | 1) {
  return { paddingLeft: depth * TASK_INDENT, minHeight: TASK_ROW_HEIGHT };
}

/**
 * Poignée de déplacement, sur le web.
 *
 * Placée après le texte de la ligne : devant, il ne reste que la case à cocher.
 * Quand la ligne n'a rien à déplacer, une cale de même largeur garde le bord
 * droit aligné d'une ligne à l'autre.
 */
export function TaskRowGrip({
  draggable,
  gripRef,
  label,
}: {
  draggable: boolean;
  gripRef: Ref<View>;
  label: string;
}) {
  if (Platform.OS !== "web") return null;

  return draggable ? (
    <View
      ref={gripRef}
      accessibilityLabel={label}
      style={{ minWidth: TASK_ROW_HEIGHT / 2, minHeight: TASK_ROW_HEIGHT }}
      className="items-center justify-center"
    >
      <Icon as={GripVertical} size={14} className="text-muted-foreground" />
    </View>
  ) : (
    <View style={{ width: TASK_ROW_HEIGHT / 2 }} />
  );
}

/** Case à cocher d'une ligne. `pending` : la ligne n'est pas encore enregistrée. */
export function TaskRowCheckbox({
  done,
  pending = false,
  label,
  onPress,
}: {
  done: boolean;
  pending?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={pending}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done, disabled: pending }}
      accessibilityLabel={label}
      hitSlop={8}
      style={{ minWidth: TASK_ROW_HEIGHT / 2, minHeight: TASK_ROW_HEIGHT }}
      className="items-center justify-center"
    >
      <View
        style={{ width: TASK_CHECKBOX_SIZE, height: TASK_CHECKBOX_SIZE }}
        className={cn(
          "items-center justify-center rounded border",
          done ? "border-primary bg-primary" : "border-border",
          pending ? "opacity-40" : "",
        )}
      >
        {done ? <Icon as={Check} size={11} className="text-primary-foreground" /> : null}
      </View>
    </Pressable>
  );
}

/** Case pâle de la ligne vierge du bas, celle où l'on écrit. */
export function TaskRowBlankCheckbox() {
  return (
    <View
      style={{ minWidth: TASK_ROW_HEIGHT / 2, minHeight: TASK_ROW_HEIGHT }}
      className="items-center justify-center"
    >
      <View
        style={{ width: TASK_CHECKBOX_SIZE, height: TASK_CHECKBOX_SIZE }}
        className="rounded border border-border opacity-40"
      />
    </View>
  );
}
