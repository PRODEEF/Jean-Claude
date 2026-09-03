import { useState } from "react";
import { View } from "react-native";
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
import { useFolderChoices } from "@/shared/hooks/use-folder-choices";
import { TaskListEditor } from "./TaskListEditor";

export type ListsBoardProps = {
  lists: TaskListWithTasks[];
  /** Liste ouverte depuis la barre latérale : mise en avant à l'arrivée. */
  highlightedId?: string;
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
  query,
  onEditList,
  onDeleteList,
  onOpenTask,
}: ListsBoardProps) {
  const folders = useFolderChoices();

  if (lists.length === 0) {
    return (
      <Text className="text-muted-foreground text-sm">
        Aucune liste pour l'instant. Créez-en une, ou laissez Jean-Claude vous en proposer une au
        fil d'une conversation.
      </Text>
    );
  }

  return (
    <View className="gap-3">
      {lists.map((list) => (
        <ListCard
          key={list.id}
          list={list}
          folderName={folders.find((folder) => folder.id === list.folderId)?.name}
          highlighted={list.id === highlightedId}
          query={query}
          onEdit={() => onEditList(list)}
          onDelete={() => onDeleteList(list)}
          onOpenTask={onOpenTask}
        />
      ))}
    </View>
  );
}

function ListCard({
  list,
  folderName,
  highlighted,
  query,
  onEdit,
  onDelete,
  onOpenTask,
}: {
  list: TaskListWithTasks;
  folderName: string | undefined;
  highlighted: boolean;
  query: string;
  onEdit: () => void;
  onDelete: () => void;
  onOpenTask: (task: Task) => void;
}) {
  /** Dépliée par défaut : une liste repliée d'office se ferait oublier. */
  const [open, setOpen] = useState(true);
  /** Point d'ouverture du menu, `null` s'il est fermé. */
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const shopping = list.kind === "shopping";
  const due = dueLabel(list.dueAt);

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
    <View className={`rounded-xl border p-3 ${highlighted ? "border-primary" : "border-border"}`}>
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
            <Text className="text-muted-foreground text-xs">
              {shopping ? "Liste d'achats" : "Liste de tâches"}
              {folderName ? ` · ${folderName}` : ""}
            </Text>
          </View>

          {/* L'échéance porte sur la liste entière : elle se lit en tête, pas
              en face d'une de ses lignes. */}
          {due ? (
            <View className="flex-row items-center gap-1">
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
          <View className="pt-2">
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

/** Ex. « jeudi 4 septembre · 14h30 », ou rien quand la liste n'a pas d'échéance. */
export function dueLabel(dueAt: string | null): string | undefined {
  if (dueAt === null) return undefined;

  const due = new Date(dueAt);
  const timed = due.getHours() !== 0 || due.getMinutes() !== 0;
  return timed ? `${formatFullDay(due)} · ${formatTime(dueAt)}` : formatFullDay(due);
}
