import { useEffect, useRef, useState, type RefObject } from "react";
import { ScrollView, View } from "react-native";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ListChecks,
  MoreHorizontal,
  ShoppingBasket,
} from "lucide-react-native";
import type { Task, TaskList, TaskListWithTasks } from "@jc/domain";
import { Button } from "@/shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import { ContextMenu, type ContextMenuItem } from "@/shared/ui/context-menu";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { formatFullDay, formatTime } from "@/shared/lib/dates";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useFolderChoices } from "@/shared/hooks/use-folder-choices";
import { TaskListEditor } from "./TaskListEditor";

export type ListsBoardProps = {
  lists: TaskListWithTasks[];
  /** Liste ouverte depuis la barre latérale : mise en avant à l'arrivée. */
  highlightedId?: string;
  /** Défilement de l'écran — pour amener la liste mise en avant à l'écran. */
  scrollRef?: RefObject<ScrollView | null>;
  /** Recherche en cours, transmise aux lignes pour les mettre en avant. */
  query: string;
  onEditList: (list: TaskList) => void;
  onDeleteList: (list: TaskList) => void;
  onOpenTask: (task: Task) => void;
};

/**
 * Toutes les listes, tous dossiers confondus (A.2).
 *
 * Les listes d'achats et les listes de tâches cohabitent sans être fusionnées :
 * une conversation sur le jardin en produit typiquement une de chaque, et les
 * réunir ferait perdre la distinction (§12.1).
 */
export function ListsBoard({
  lists,
  highlightedId,
  scrollRef,
  query,
  onEditList,
  onDeleteList,
  onOpenTask,
}: ListsBoardProps) {
  const folders = useFolderChoices();
  // Resserré sur grand écran seulement : au doigt, l'espace généreux laisse
  // de la marge à l'erreur, alors que la souris pointe avec précision et
  // profite d'en voir plus à la fois.
  const desktop = useBreakpoint() === "expanded";

  if (lists.length === 0) {
    return (
      <Text className="text-muted-foreground text-sm">
        Aucune liste pour l'instant. Créez-en une, ou laissez Jean-Claude vous en proposer une au
        fil d'une conversation.
      </Text>
    );
  }

  return (
    <View className={desktop ? "gap-2" : "gap-3"}>
      {lists.map((list) => (
        <ListCard
          key={list.id}
          list={list}
          folderName={folders.find((folder) => folder.id === list.folderId)?.name}
          highlighted={list.id === highlightedId}
          desktop={desktop}
          {...(scrollRef ? { scrollRef } : {})}
          query={query}
          onEdit={() => onEditList(list)}
          onDelete={() => onDeleteList(list)}
          onOpenTask={onOpenTask}
        />
      ))}
    </View>
  );
}

/** Marge laissée au-dessus de la carte mise en avant, pour ne pas la coller au bandeau. */
const HIGHLIGHT_SCROLL_MARGIN = 16;

function ListCard({
  list,
  folderName,
  highlighted,
  desktop,
  scrollRef,
  query,
  onEdit,
  onDelete,
  onOpenTask,
}: {
  list: TaskListWithTasks;
  folderName: string | undefined;
  highlighted: boolean;
  desktop: boolean;
  scrollRef?: RefObject<ScrollView | null>;
  query: string;
  onEdit: () => void;
  onDelete: () => void;
  onOpenTask: (task: Task) => void;
}) {
  /** Dépliée par défaut : une liste repliée d'office se ferait oublier. */
  const [open, setOpen] = useState(true);
  /** Point d'ouverture du menu, `null` s'il est fermé. */
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const card = useRef<View>(null);

  // Amène la carte visée depuis la barre latérale à l'écran : la mettre en
  // avant ne suffit pas quand « Mes listes » en compte assez pour déborder
  // l'écran, la carte reste alors hors champ malgré sa bordure.
  useEffect(() => {
    if (!highlighted || !scrollRef) return;

    const frame = requestAnimationFrame(() => {
      const scrollNode = scrollRef.current?.getNativeScrollRef();
      if (!scrollNode) return;

      // Mesurée relativement au défilement lui-même plutôt qu'à l'écran : la
      // carte peut être imbriquée sous n'importe quel nombre de vues
      // intermédiaires, `measureLayout` s'en affranchit.
      card.current?.measureLayout(scrollNode, (_x, y) => {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - HIGHLIGHT_SCROLL_MARGIN), animated: true });
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [highlighted, scrollRef]);

  const shopping = list.kind === "shopping";
  const due = dueLabel(list);

  const items: ContextMenuItem[] = [
    {
      label: "Modifier la liste",
      onPress: () => {
        setMenu(null);
        onEdit();
      },
    },
    {
      label: "Supprimer la liste",
      destructive: true,
      onPress: () => {
        setMenu(null);
        onDelete();
      },
    },
  ];

  return (
    <View
      ref={card}
      className={`rounded-xl border ${desktop ? "p-2" : "p-3"} ${highlighted ? "border-primary" : "border-border"}`}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <View className="flex-row items-center gap-2">
          <Icon
            as={shopping ? ShoppingBasket : ListChecks}
            size={16}
            className="text-muted-foreground"
          />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold" numberOfLines={1}>
              {list.title}
            </Text>
            {/* Le dossier est rappelé ici parce que la liste s'y voit aussi
              (A.2) : c'est la même liste, pas une copie rangée ailleurs. */}
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>
              {shopping ? "Liste d'achats" : "Liste de tâches"}
              {folderName ? ` · ${folderName}` : ""}
            </Text>
          </View>

          {/* L'échéance porte sur la liste entière : elle se lit en tête, pas
              en face d'une de ses lignes. `flex-1` et non `shrink` seul :
              avec `flex-basis: 0` des deux côtés, le titre et l'échéance se
              partagent l'espace restant à parts égales une fois les icônes
              et boutons posés — sinon ce bloc garde sa largeur de contenu
              pleine et le titre, seul à céder, s'écrase à presque rien. */}
          {due ? (
            <View className="min-w-0 flex-1 flex-row items-center gap-1">
              <Icon as={CalendarClock} size={14} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                {due}
              </Text>
            </View>
          ) : null}

          <Button
            variant="ghost"
            size="icon"
            hitSlop={8}
            onPress={(event) => setMenu({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })}
            accessibilityLabel={`Actions pour ${list.title}`}
            className="size-8"
          >
            <Icon as={MoreHorizontal} size={16} className="text-muted-foreground" />
          </Button>

          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              hitSlop={8}
              accessibilityLabel={open ? `Replier ${list.title}` : `Déplier ${list.title}`}
              className="size-8"
            >
              <Icon
                as={open ? ChevronDown : ChevronRight}
                size={16}
                className="text-muted-foreground"
              />
            </Button>
          </CollapsibleTrigger>
        </View>

        <CollapsibleContent>
          {/* La capture ne demande rien d'autre que du texte : ni date, ni
              dossier au moment où l'on écrit (§13.4.1). Le reste se pose
              ensuite, sur la liste. */}
          <View className={desktop ? "pt-1.5" : "pt-2"}>
            <TaskListEditor list={list} query={query} onOpenTask={onOpenTask} />
          </View>
        </CollapsibleContent>
      </Collapsible>

      {/* Monté à la demande : `ContextMenu` rend une fenêtre modale dès qu'il
          existe, il n'a pas de garde interne. */}
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />
      ) : null}
    </View>
  );
}

/**
 * Ex. « jeudi 4 septembre · 14h30 », ou rien quand la liste n'a pas d'échéance.
 *
 * L'heure ne s'affiche que si l'échéance en vise une : `dueAllDay` le dit,
 * plutôt que de le relire dans l'horloge de l'appareil.
 */
export function dueLabel(list: Pick<TaskList, "dueAt" | "dueAllDay">): string | undefined {
  if (list.dueAt === null) return undefined;

  const due = new Date(list.dueAt);
  return list.dueAllDay === false
    ? `${formatFullDay(due)} · ${formatTime(list.dueAt)}`
    : formatFullDay(due);
}
