import { useState } from "react";
import { View } from "react-native";
import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  MoreHorizontal,
  Plus,
  ShoppingBasket,
} from "lucide-react-native";
import type { Task, TaskList, TaskListWithTasks } from "@jc/domain";
import { Button } from "@/shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import { ContextMenu, type ContextMenuItem } from "@/shared/ui/context-menu";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Text } from "@/shared/ui/text";
import { formatFullDay, formatTime } from "@/shared/lib/dates";
import { useFolderChoices } from "@/shared/hooks/use-folder-choices";
import { useTaskActions } from "@/shared/hooks/use-task-lists";
import { TaskRow } from "./TaskRow";

export type ListsBoardProps = {
  lists: TaskListWithTasks[];
  /** Liste ouverte depuis la barre latérale : mise en avant à l'arrivée. */
  highlightedId?: string;
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
  onEdit,
  onDelete,
  onOpenTask,
}: {
  list: TaskListWithTasks;
  folderName: string | undefined;
  highlighted: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOpenTask: (task: Task) => void;
}) {
  const { addTask, removeTask } = useTaskActions();
  const [draft, setDraft] = useState("");
  /** Dépliée par défaut : une liste repliée d'office se ferait oublier. */
  const [open, setOpen] = useState(true);
  /**
   * Mode suppression.
   *
   * La corbeille n'est plus en face de chaque ligne à demeure : cocher est le
   * geste courant, supprimer l'exception, et les deux se touchaient du doigt.
   */
  const [removing, setRemoving] = useState(false);
  /** Point d'ouverture du menu, `null` s'il est fermé. */
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const shopping = list.kind === "shopping";

  const submit = () => {
    const title = draft.trim();
    if (title.length === 0) return;
    setDraft("");
    addTask.mutate({ listId: list.id, input: { title } });
  };

  const items: ContextMenuItem[] = [
    {
      label: "Modifier la liste",
      onPress: () => {
        setMenu(null);
        onEdit();
      },
    },
    {
      label: "Supprimer des éléments",
      onPress: () => {
        setMenu(null);
        // Entrer dans le mode sur une liste repliée n'aurait rien de visible.
        setOpen(true);
        setRemoving(true);
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
            as={shopping ? ShoppingBasket : FolderIcon}
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

          {/* Une seule affordance à la fois : tant qu'on supprime, le menu
            s'efface derrière la sortie du mode. */}
          {removing ? (
            <Button
              variant="outline"
              size="sm"
              onPress={() => setRemoving(false)}
              accessibilityLabel={`Terminer la suppression dans ${list.title}`}
            >
              <Text>Terminé</Text>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              hitSlop={8}
              onPress={(event) =>
                setMenu({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })
              }
              accessibilityLabel={`Actions pour ${list.title}`}
              className="size-8"
            >
              <Icon as={MoreHorizontal} size={16} className="text-muted-foreground" />
            </Button>
          )}

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
          {/* Sans écart entre les rangées : la hauteur tactile de 44 pt les
              sépare déjà, et un interligne de plus faisait tenir trois courses
              là où l'écran en montrait dix. */}
          <View className="pt-2">
            {list.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                meta={dueLabel(task.dueAt)}
                onOpen={() => onOpenTask(task)}
                {...(removing
                  ? { onRemove: () => removeTask.mutate({ listId: list.id, taskId: task.id }) }
                  : {})}
              />
            ))}
          </View>

          {/* La capture ne demande rien d'autre qu'un titre : ni date, ni dossier
            au moment où l'on écrit (§13.4.1). Le reste se pose ensuite. */}
          <View className="flex-row items-center gap-2 pt-2">
            <Icon as={Plus} size={14} className="text-muted-foreground" />
            <Input
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={submit}
              onBlur={submit}
              returnKeyType="done"
              placeholder={shopping ? "Ajouter un achat" : "Ajouter une tâche"}
              accessibilityLabel={`Ajouter une tâche à ${list.title}`}
              className="flex-1 border-0 px-0"
            />
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

/** Ex. « jeudi 4 septembre · 14h30 », ou rien quand la tâche n'a pas d'échéance. */
function dueLabel(dueAt: string | null): string | undefined {
  if (dueAt === null) return undefined;

  const due = new Date(dueAt);
  const timed = due.getHours() !== 0 || due.getMinutes() !== 0;
  return timed ? `${formatFullDay(due)} · ${formatTime(dueAt)}` : formatFullDay(due);
}
