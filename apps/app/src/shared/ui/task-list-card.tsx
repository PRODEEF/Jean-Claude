import type { ReactNode, Ref } from "react";
import { Platform, Pressable, View, type GestureResponderEvent } from "react-native";
import {
  Check,
  Folder,
  GripVertical,
  ListChecks,
  MapPin,
  MoreHorizontal,
  Repeat,
  ShoppingBasket,
} from "lucide-react-native";
import { cn } from "@/shared/lib/utils";
import {
  TASK_AXIS_OFFSET,
  TASK_CHECKBOX_SIZE,
  TASK_INDENT,
  TASK_ROW_HEIGHT,
} from "@/shared/lib/tasks";
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
  flat = false,
  cardRef,
}: {
  children: ReactNode;
  desktop: boolean;
  /** Carte visée depuis la barre latérale. */
  highlighted?: boolean;
  /** Sans contour ni marge : la carte s'inscrit dans une journée du calendrier. */
  flat?: boolean;
  /** Pour amener la carte à l'écran. */
  cardRef?: Ref<View>;
}) {
  return (
    <View
      ref={cardRef}
      className={cn(
        flat
          ? "py-0.5"
          : cn(
              "rounded-xl border",
              desktop ? "p-2" : "p-3",
              highlighted ? "border-primary" : "border-border",
            ),
      )}
    >
      {children}
    </View>
  );
}

/**
 * En-tête : le titre, puis le type, le dossier et l'échéance, et le menu.
 *
 * `leading` précède le type — le repli et le titre dans « Mes listes » ; un
 * espace n'en met pas, son titre est déjà celui de la page.
 *
 * Tout est sur une seule ligne qui passe à la ligne : le titre d'abord, puis
 * chaque élément se range à la suite tant qu'il y a la place, et descend seul
 * quand elle manque (volet de droite réduit, téléphone). Sur une ligne
 * unique, c'était le titre qui s'écrasait, alors que c'est lui qu'on lit.
 * Le menu reste posé en haut à droite, hors du flux, pour ne jamais descendre.
 */
export function TaskListCardHeader({
  title,
  shopping,
  folderName,
  due,
  leading,
  onFolderPress,
  onDuePress,
  onTypePress,
  onMenuPress,
  menuLabel,
  location,
  repeat,
  compact = false,
}: {
  /** Réduit les boutons et les marges : la ligne repliée prend moins de hauteur. */
  compact?: boolean;
  /** Pour les libellés d'accessibilité. */
  title: string;
  shopping: boolean;
  folderName: string | undefined;
  due: string | undefined;
  leading?: ReactNode;
  onFolderPress: (event: GestureResponderEvent) => void;
  onDuePress: (event: GestureResponderEvent) => void;
  /** Absent, le type n'est qu'une indication ; présent, un appui propose de le changer. */
  onTypePress?: (event: GestureResponderEvent) => void;
  onMenuPress: (event: GestureResponderEvent) => void;
  menuLabel: string;
  /** Lieu du rendez-vous, sous l'en-tête quand il y en a un. */
  location?: string | undefined;
  /** Libellé de la répétition (« Toutes les semaines »), quand la liste se répète. */
  repeat?: string | undefined;
}) {
  const typeContent = (
    <>
      <Icon
        as={shopping ? ShoppingBasket : ListChecks}
        size={16}
        className="text-muted-foreground"
      />
      <Text className="text-muted-foreground shrink text-xs" numberOfLines={1}>
        {shopping ? "Liste d'achats" : "Liste de tâches"}
      </Text>
    </>
  );
  const type = onTypePress ? (
    <Pressable
      onPress={onTypePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Type de ${title} : ${shopping ? "liste d'achats" : "liste de tâches"}`}
      className={cn(
        "min-w-0 shrink flex-row items-center gap-1.5 rounded-md px-1.5",
        compact ? "py-0.5" : "py-1",
      )}
    >
      {typeContent}
    </Pressable>
  ) : (
    <View className="flex-row items-center gap-2">{typeContent}</View>
  );

  const folder = (
    <Pressable
      onPress={onFolderPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Dossier de ${title} : ${folderName ?? "aucun"}`}
      className={cn(
        "min-w-0 shrink flex-row items-center gap-1 rounded-md px-1.5",
        compact ? "py-0.5" : "py-1",
      )}
    >
      <Icon as={Folder} size={14} className="text-muted-foreground" />
      <Text className="text-muted-foreground shrink text-xs" numberOfLines={1}>
        {folderName ?? "Dossier"}
      </Text>
    </Pressable>
  );

  // L'échéance porte sur la liste entière : elle se lit en tête, et se change
  // d'un appui. Sans date, l'invite reste visible : c'est elle qui la rend
  // atteignable.
  const dueButton = (
    <Pressable
      onPress={onDuePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Échéance de ${title} : ${due ?? "aucune"}`}
      className={cn(
        "shrink-0 flex-row items-center gap-1 rounded-md px-1.5",
        compact ? "py-0.5" : "py-1",
      )}
    >
      <Text className="text-muted-foreground text-xs" numberOfLines={1}>
        {due ?? "Date"}
      </Text>
    </Pressable>
  );

  const menu = (
    <Button
      variant="ghost"
      size="icon"
      hitSlop={8}
      onPress={onMenuPress}
      accessibilityLabel={menuLabel}
      className={compact ? "size-7" : "size-8"}
    >
      <Icon as={MoreHorizontal} size={16} className="text-muted-foreground" />
    </Button>
  );

  return (
    <View className="relative">
      {/* Réserve à droite la place du menu, qui est posé par-dessus. */}
      <View
        className={cn(
          "flex-row flex-wrap items-center gap-x-2 gap-y-0.5",
          compact ? "pr-8" : "pr-10",
        )}
      >
        <View className="min-w-0 max-w-full shrink flex-row items-center gap-1">{leading}</View>
        {type}
        {folder}
        {/* Pousse l'échéance à droite quand tout tient sur la ligne ; elle
            descend à gauche quand elle n'y tient plus. */}
        <View style={{ flexGrow: 1, flexBasis: 8 }} />
        {dueButton}
      </View>
      <View className="absolute right-0 top-0">{menu}</View>
      {location || repeat ? (
        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-0.5 pr-10 pt-0.5">
          {location ? (
            <View className="min-w-0 shrink flex-row items-center gap-1">
              <Icon as={MapPin} size={13} className="text-muted-foreground" />
              <Text
                className="text-muted-foreground shrink text-xs"
                numberOfLines={1}
                accessibilityLabel={`Lieu : ${location}`}
              >
                {location}
              </Text>
            </View>
          ) : null}
          {repeat ? (
            <View className="flex-row items-center gap-1">
              <Icon as={Repeat} size={13} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                {repeat}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Zone des lignes, sous l'en-tête. */
export function TaskListCardBody({ children, desktop }: { children: ReactNode; desktop: boolean }) {
  return <View className={cn("gap-0.5", desktop ? "pt-1.5" : "pt-2")}>{children}</View>;
}

/** Mesures d'une ligne : sa hauteur, et son retrait quand c'est une sous-tâche. */
export function taskRowStyle(depth: 0 | 1) {
  return { paddingLeft: TASK_AXIS_OFFSET + depth * TASK_INDENT, minHeight: TASK_ROW_HEIGHT };
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
