import { useState } from "react";
import { ScrollView, View } from "react-native";
import { X } from "lucide-react-native";
import type { Task, TaskListWithTasks } from "@jc/domain";
import { datedLists, dueOnForDay, listsOfDay } from "@jc/domain";
import { formatFullDay } from "@/shared/lib/dates";
import { useDetailPane, type PaneContent } from "@/shared/providers/detail-pane";
import { useTaskLists } from "@/shared/hooks/use-task-lists";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { TaskDialog } from "@/features/todo/TaskDialog";
import { TaskListEditor } from "@/features/todo/TaskListEditor";
import { isTaskSubset, timeLabel } from "@/features/calendar/DueListsBoard";

/** Largeur du volet : assez pour une liste lisible, sans écraser le milieu. */
export const DETAIL_PANE_WIDTH = 420;

/**
 * Volet de droite. Rien à l'écran tant qu'aucun contenu n'est choisi.
 */
export function DetailPane() {
  const { content, close } = useDetailPane();
  if (!content) return null;

  return (
    <View
      className="border-border bg-background border-l"
      style={{ width: DETAIL_PANE_WIDTH }}
      accessibilityLabel="Détail"
    >
      <View className="border-border h-12 flex-row items-center justify-between gap-2 border-b px-3">
        <Text className="min-w-0 flex-1 text-sm font-semibold" numberOfLines={1}>
          <PaneTitle content={content} />
        </Text>
        <Button
          variant="ghost"
          size="icon"
          hitSlop={8}
          onPress={close}
          accessibilityLabel="Fermer le détail"
          className="size-8"
        >
          <Icon as={X} size={16} className="text-muted-foreground" />
        </Button>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
        <PaneBody content={content} />
      </ScrollView>
    </View>
  );
}

function PaneTitle({ content }: { content: PaneContent }) {
  const { data: lists } = useTaskLists();
  if (content.kind === "day") return <>{formatFullDay(content.day)}</>;
  return <>{lists?.find((list) => list.id === content.listId)?.title ?? "Liste"}</>;
}

function PaneBody({ content }: { content: PaneContent }) {
  const { data: lists } = useTaskLists();
  const [openedTask, setOpenedTask] = useState<Task | null>(null);

  // La liste telle qu'enregistrée : une entrée du jour peut n'en être que la
  // projection sur les tâches de ce jour, qu'on ne doit pas renvoyer seules.
  const saved = lists ?? [];
  const day = content.kind === "day" ? content.day : null;
  const entries = entriesOf(content, saved);

  const editedTask =
    openedTask === null
      ? null
      : (saved.flatMap((list) => list.tasks).find((task) => task.id === openedTask.id) ?? null);

  return (
    <>
      {entries.length === 0 ? (
        <Text className="text-muted-foreground text-sm">
          {day ? "Aucune tâche ce jour-là." : "Cette liste n'existe plus."}
        </Text>
      ) : (
        entries.map(({ list, day: forDay }) => (
          <PaneList
            key={`${list.id}-${forDay?.toDateString() ?? "all"}`}
            shown={list}
            saved={saved.find((candidate) => candidate.id === list.id) ?? list}
            day={forDay}
            onOpenTask={setOpenedTask}
          />
        ))
      )}
      <TaskDialog task={editedTask} onClose={() => setOpenedTask(null)} />
    </>
  );
}

/**
 * Une liste dans le volet : son titre et son éditeur, le même que « Mes listes ».
 * Pour un jour donné, seules les tâches de ce jour sont montrées, et une ligne
 * nouvelle rejoint ce jour.
 */
function PaneList({
  shown,
  saved,
  day,
  onOpenTask,
}: {
  shown: TaskListWithTasks;
  saved: TaskListWithTasks;
  day: Date | null;
  onOpenTask: (task: Task) => void;
}) {
  const time = timeLabel(shown);
  const dueOn = day ? dueOnForDay(saved, day) : null;
  const subset = isTaskSubset(saved, shown);

  return (
    <View className="border-border gap-0.5 rounded-lg border p-1.5">
      <View className="h-7 flex-row items-center gap-2 px-1">
        {time ? <Text className="text-sm font-semibold">{time}</Text> : null}
        <Text className="min-w-0 flex-1 text-sm font-medium" numberOfLines={1}>
          {shown.title}
        </Text>
      </View>
      <TaskListEditor
        list={saved}
        query=""
        onOpenTask={onOpenTask}
        {...(subset ? { visibleTaskIds: shown.tasks.map((task) => task.id) } : {})}
        {...(dueOn ? { dueOnForNew: dueOn } : {})}
      />
    </View>
  );
}

/** Les listes à montrer pour ce contenu : une liste entière, ou celles d'un jour. */
function entriesOf(
  content: PaneContent,
  saved: TaskListWithTasks[],
): { list: TaskListWithTasks; day: Date | null }[] {
  if (content.kind === "list") {
    const found = saved.find((list) => list.id === content.listId);
    return found ? [{ list: found, day: null }] : [];
  }
  return listsOfDay(datedLists(saved), content.day).map((list) => ({ list, day: content.day }));
}
