import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react-native";
import type { Task, TaskList } from "@jc/domain";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useTaskLists } from "@/shared/hooks/use-task-lists";
import { addDays, startOfWeek, weekDays, weekLabel } from "@/shared/lib/dates";
import { datedTasks } from "@/shared/lib/tasks";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { ListsBoard } from "./ListsBoard";
import { TaskDialog } from "./TaskDialog";
import { TaskListDialog, type TaskListTarget } from "./TaskListDialog";
import { WeekBoard } from "./WeekBoard";

type TodoView = "week" | "lists";

const VIEWS: { value: TodoView; label: string }[] = [
  { value: "week", label: "Semaine" },
  { value: "lists", label: "Mes listes" },
];

/**
 * Onglet TODOLISTE — vue centralisée, tous dossiers confondus (A.2).
 *
 * Deux lectures d'une même donnée : la semaine, qui ne montre que ce qui est
 * daté, et les listes, où une tâche sans échéance reste visible. Une liste
 * d'achats n'a jamais de date : la cantonner à la semaine la rendrait
 * introuvable.
 *
 * Un seul chargement les alimente toutes les deux — basculer de l'une à
 * l'autre ne redemande rien au serveur.
 */
export function TodoScreen() {
  const compact = useBreakpoint() === "compact";
  const { list: openedList } = useLocalSearchParams<{ list?: string }>();

  const [view, setView] = useState<TodoView>(openedList ? "lists" : "week");
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [listTarget, setListTarget] = useState<TaskListTarget | null>(null);
  const [openedTask, setOpenedTask] = useState<Task | null>(null);

  // Arriver depuis la barre latérale ouvre la liste visée : l'écran est déjà
  // monté quand le paramètre change, et l'état initial ne suffit donc pas.
  useEffect(() => {
    if (openedList) setView("lists");
  }, [openedList]);

  const { data, isPending, isError } = useTaskLists();
  const lists = useMemo(() => data ?? [], [data]);
  const tasks = useMemo(() => datedTasks(lists), [lists]);
  const days = useMemo(() => weekDays(anchor), [anchor]);

  // La tâche affichée dans la fenêtre est relue à chaque chargement : sans
  // cela, cocher une tâche depuis son détail laisserait la fenêtre montrer
  // l'état d'avant.
  const editedTask =
    openedTask === null
      ? null
      : (lists
          .flatMap((list) => list.tasks)
          .find((task) => task.id === openedTask.id) ?? null);

  const switcher = (
    <View className="bg-muted flex-row gap-1 rounded-full p-1">
      {VIEWS.map((item) => (
        <Button
          key={item.value}
          size="sm"
          variant={view === item.value ? "secondary" : "ghost"}
          className="rounded-full"
          onPress={() => setView(item.value)}
          accessibilityRole="button"
          accessibilityState={{ selected: view === item.value }}
        >
          <Text>{item.label}</Text>
        </Button>
      ))}
    </View>
  );

  const navigation = (
    <View className="flex-row items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET }}
        onPress={() => setAnchor((current) => addDays(current, -7))}
        accessibilityRole="button"
        accessibilityLabel="Semaine précédente"
      >
        <Icon as={ChevronLeft} className="size-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onPress={() => setAnchor(startOfWeek(new Date()))}
        accessibilityRole="button"
      >
        <Text>Cette semaine</Text>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET }}
        onPress={() => setAnchor((current) => addDays(current, 7))}
        accessibilityRole="button"
        accessibilityLabel="Semaine suivante"
      >
        <Icon as={ChevronRight} className="size-4" />
      </Button>
    </View>
  );

  return (
    <View className="bg-background flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="w-full max-w-[900px] gap-4 self-center p-6"
      >
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-2xl font-semibold">Todoliste</Text>
          <Button
            size="sm"
            onPress={() => setListTarget({ mode: "create", folderId: null })}
            accessibilityRole="button"
            accessibilityLabel="Nouvelle liste"
          >
            <Icon as={Plus} className="size-4" />
            <Text>Liste</Text>
          </Button>
        </View>

        {/* Sous le point de rupture, la bascule et la navigation ne tiennent
            pas sur la même ligne que la période affichée. */}
        {view === "week" ? (
          compact ? (
            <View className="gap-3">
              <Text className="text-base font-medium">{weekLabel(anchor)}</Text>
              <View className="flex-row items-center justify-between gap-2">
                {switcher}
                {navigation}
              </View>
            </View>
          ) : (
            <View className="flex-row items-center gap-3">
              <View className="min-w-0 flex-1">
                <Text className="text-base font-medium" numberOfLines={1}>
                  {weekLabel(anchor)}
                </Text>
              </View>
              {switcher}
              <View className="min-w-0 flex-1 flex-row justify-end">{navigation}</View>
            </View>
          )
        ) : (
          <View className="flex-row items-center justify-between gap-3">{switcher}</View>
        )}

        {isError ? (
          <Text className="text-destructive text-sm">
            Les todolistes n'ont pas pu être chargées. Réessayez dans un instant.
          </Text>
        ) : null}

        {view === "week" ? (
          <WeekBoard days={days} tasks={tasks} />
        ) : (
          <ListsBoard
            lists={lists}
            {...(openedList ? { highlightedId: openedList } : {})}
            onEditList={(list: TaskList) => setListTarget({ mode: "edit", list })}
            onOpenTask={setOpenedTask}
          />
        )}

        {isPending ? <Text className="text-muted-foreground text-xs">Chargement…</Text> : null}
      </ScrollView>

      <TaskListDialog target={listTarget} onClose={() => setListTarget(null)} />
      <TaskDialog task={editedTask} onClose={() => setOpenedTask(null)} />
    </View>
  );
}
