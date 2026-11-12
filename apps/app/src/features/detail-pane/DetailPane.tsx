import { useRef, useState } from "react";
import { PanResponder, ScrollView, View, useWindowDimensions } from "react-native";
import { X } from "lucide-react-native";
import type { Task, TaskList, TaskListWithTasks } from "@jc/domain";
import { datedLists, dueOnForDay, listsOfDay } from "@jc/domain";
import { formatFullDay } from "@/shared/lib/dates";
import { useDetailPane, type PaneContent } from "@/shared/providers/detail-pane";
import { useFolderChoices, type FolderChoice } from "@/shared/hooks/use-folder-choices";
import { useTaskLists } from "@/shared/hooks/use-task-lists";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { HEADER_HEIGHT } from "@/shared/ui/screen-shell";
import { Text } from "@/shared/ui/text";
import { TaskDialog } from "@/features/todo/TaskDialog";
import { ListCard } from "@/features/todo/ListCard";
import { TaskListDeleteDialog } from "@/features/todo/TaskListDeleteDialog";
import { TaskListDialog, type TaskListTarget } from "@/features/todo/TaskListDialog";
import { isTaskSubset } from "@/features/calendar/DueListsBoard";

/** En deçà, l'en-tête d'une liste se tronque ; au-delà, le milieu n'est plus lisible. */
const PANE_MIN_WIDTH = 360;
const PANE_MAX_WIDTH = 720;
/** Part de la fenêtre qu'il faut laisser au milieu, quelle que soit la largeur demandée. */
const CENTER_MIN_WIDTH = 480;

/**
 * Volet de droite. Rien à l'écran tant qu'aucun contenu n'est choisi.
 */
export function DetailPane() {
  const { content, close, width, setWidth } = useDetailPane();
  const { width: windowWidth } = useWindowDimensions();
  if (!content) return null;

  // Le volet ne mange jamais le milieu : sur une fenêtre étroite, le plafond
  // descend avec elle plutôt que de laisser le calendrier illisible.
  const maxWidth = Math.max(
    PANE_MIN_WIDTH,
    Math.min(PANE_MAX_WIDTH, windowWidth - CENTER_MIN_WIDTH),
  );
  const paneWidth = Math.min(maxWidth, Math.max(PANE_MIN_WIDTH, width));

  return (
    <View
      className="border-border bg-background border-l"
      style={{ width: paneWidth }}
      accessibilityLabel="Détail"
    >
      <ResizeHandle width={paneWidth} maxWidth={maxWidth} onResize={setWidth} />
      {/* Même hauteur que le bandeau du milieu (`ScreenHeader`) : les deux
          lignes de séparation doivent tomber à la même hauteur. */}
      <View
        className="border-border flex-row items-center justify-between gap-2 border-b px-3"
        style={{ height: HEADER_HEIGHT }}
      >
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

/**
 * Poignée posée à cheval sur la bordure gauche du volet : tirer vers la gauche
 * l'élargit. Même mécanique que celle de la barre latérale, qui part de la
 * largeur à la prise et non de la largeur courante pour ne pas cumuler le
 * déplacement déjà appliqué.
 */
function ResizeHandle({
  width,
  maxWidth,
  onResize,
}: {
  width: number;
  maxWidth: number;
  onResize: (width: number) => void;
}) {
  const latest = useRef({ width, maxWidth, onResize });
  latest.current = { width, maxWidth, onResize };
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
          latest.current.maxWidth,
          Math.max(PANE_MIN_WIDTH, startWidth.current - gesture.dx),
        );
        latest.current.onResize(next);
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  return (
    <View
      {...responder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel="Ajuster la largeur du détail"
      className="absolute inset-y-0 -left-1.5 z-10 w-3 web:cursor-col-resize"
    />
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
  const [listTarget, setListTarget] = useState<TaskListTarget | null>(null);
  const [deletingList, setDeletingList] = useState<TaskList | null>(null);
  const folders = useFolderChoices();

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
            folders={folders}
            onOpenTask={setOpenedTask}
            onEdit={(target) => setListTarget({ mode: "edit", list: target })}
            onDelete={setDeletingList}
          />
        ))
      )}
      <TaskDialog task={editedTask} onClose={() => setOpenedTask(null)} />
      <TaskListDialog target={listTarget} onClose={() => setListTarget(null)} />
      <TaskListDeleteDialog list={deletingList} onClose={() => setDeletingList(null)} />
    </>
  );
}

/**
 * Une liste dans le volet : la carte de « Mes listes », en-tête, repli et
 * éditeur compris. Pour un jour donné, seules les tâches de ce jour sont
 * montrées, et une ligne nouvelle rejoint ce jour.
 */
function PaneList({
  shown,
  saved,
  day,
  folders,
  onOpenTask,
  onEdit,
  onDelete,
}: {
  shown: TaskListWithTasks;
  saved: TaskListWithTasks;
  day: Date | null;
  folders: FolderChoice[];
  onOpenTask: (task: Task) => void;
  onEdit: (list: TaskList) => void;
  onDelete: (list: TaskList) => void;
}) {
  const dueOn = day ? dueOnForDay(saved, day) : null;
  const subset = isTaskSubset(saved, shown);

  return (
    <ListCard
      list={saved}
      folders={folders}
      desktop
      query=""
      onOpenTask={onOpenTask}
      onEdit={() => onEdit(saved)}
      onDelete={() => onDelete(saved)}
      {...(subset ? { visibleTaskIds: shown.tasks.map((task) => task.id) } : {})}
      {...(dueOn ? { dueOnForNew: dueOn } : {})}
    />
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
