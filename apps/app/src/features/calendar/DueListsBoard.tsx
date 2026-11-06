import { useState } from "react";
import { Platform, View } from "react-native";
import { GripVertical, ListChecks, MoreHorizontal, ShoppingBasket } from "lucide-react-native";
import type { MomentKey, Task, TaskList, TaskListWithTasks } from "@jc/domain";
import { dueForMoment, dueOnForDay, momentsOfDay, openTaskCount, startOfDay } from "@jc/domain";
import { formatFullDay, formatTime, isSameDay } from "@/shared/lib/dates";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useDayPartBounds } from "@/shared/hooks/use-profile";
import { useTaskActions, useTaskLists } from "@/shared/hooks/use-task-lists";
import { TaskDialog } from "@/features/todo/TaskDialog";
import { TaskListDeleteDialog } from "@/features/todo/TaskListDeleteDialog";
import { TaskListDialog, type TaskListTarget } from "@/features/todo/TaskListDialog";
import { TaskListEditor } from "@/features/todo/TaskListEditor";
import { TaskRow } from "@/features/todo/TaskRow";
import { Button } from "@/shared/ui/button";
import { ContextMenu, type ContextMenuItem } from "@/shared/ui/context-menu";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { useListDragHandle, useMomentDropZone } from "./lib/list-drag";

export type DueListsBoardProps = {
  /** Les jours à afficher, dans l'ordre — une semaine ou un mois selon l'appelant. */
  days: Date[];
  lists: TaskListWithTasks[];
};

/**
 * Todolistes échues, un bloc par jour découpé en moments (A.2).
 *
 * Chaque liste s'édite comme dans Mes listes : une ligne par tâche, à cocher,
 * indenter et réordonner sur place. Les bandeaux matin, après-midi et soir
 * restent — c'est eux qui situent la journée, Mes listes ne les a pas.
 */
export function DueListsBoard({ days, lists }: DueListsBoardProps) {
  const today = new Date();
  const [listTarget, setListTarget] = useState<TaskListTarget | null>(null);
  const [deletingList, setDeletingList] = useState<TaskList | null>(null);
  const [openedTask, setOpenedTask] = useState<Task | null>(null);
  // Resserré sur grand écran seulement : un mois entier de listes tient mal
  // sur téléphone où l'espace généreux protège du doigt, mais gagne à se
  // resserrer sur un écran large où plusieurs semaines sont visibles à la fois.
  const desktop = useBreakpoint() === "expanded";
  const bounds = useDayPartBounds();
  // Les listes telles qu'enregistrées : une entrée de `lists` peut n'être que
  // la projection d'une liste sur le jour de certaines de ses tâches, avec une
  // échéance remplacée par ce jour.
  const { data: savedLists } = useTaskLists();
  const { updateList } = useTaskActions();
  const [moveFailure, setMoveFailure] = useState<string | null>(null);

  /**
   * Dépose une liste sur un moment d'un jour. Seule l'échéance d'une liste
   * enregistrée se déplace : l'entrée recomposée pour le jour de certaines de
   * ses tâches n'a pas d'échéance à elle.
   */
  const moveList = (listId: string, day: Date, moment: MomentKey) => {
    const saved = savedLists?.find((candidate) => candidate.id === listId);
    if (!saved) return;
    const due = dueForMoment(day, moment, saved, bounds);
    if (due.dueAt === saved.dueAt && due.dueAllDay === saved.dueAllDay) return;

    setMoveFailure(null);
    updateList.mutate(
      { id: listId, patch: due },
      {
        onError: () => setMoveFailure("Le déplacement a échoué. Réessayez dans un instant."),
      },
    );
  };

  /** Une liste ne se déplace que si l'échéance qu'elle porte est la sienne, et pas vers un jour révolu. */
  const canMoveTo = (listId: string, day: Date, moment: MomentKey) => {
    const saved = savedLists?.find((candidate) => candidate.id === listId);
    if (!saved || saved.dueAt === null) return false;
    if (startOfDay(day).getTime() < startOfDay(new Date()).getTime()) return false;
    const due = dueForMoment(day, moment, saved, bounds);
    return due.dueAt !== saved.dueAt || due.dueAllDay !== saved.dueAllDay;
  };
  const editedTask =
    openedTask === null
      ? null
      : ((savedLists ?? lists)
          .flatMap((list) => list.tasks)
          .find((task) => task.id === openedTask.id) ?? null);

  return (
    <View className={desktop ? "gap-2" : "gap-3"}>
      {moveFailure ? <Text className="text-destructive text-xs">{moveFailure}</Text> : null}
      {days.map((day) => {
        const groups = momentsOfDay(lists, day, bounds);
        const remaining = groups.reduce(
          (count, group) => count + group.lists.reduce((sum, list) => sum + openTaskCount(list), 0),
          0,
        );
        const isToday = isSameDay(day, today);

        return (
          <View
            key={day.toISOString()}
            className={`gap-2 rounded-xl border ${desktop ? "p-2" : "p-3"} ${
              isToday ? "border-primary" : "border-border"
            }`}
          >
            <View className="flex-row items-center justify-between gap-2">
              <Text
                className={`text-base font-bold uppercase ${
                  isToday ? "text-primary" : "text-foreground"
                }`}
              >
                {formatFullDay(day)}
              </Text>
              {remaining > 0 ? (
                <Text className="text-muted-foreground text-xs">{remaining} à faire</Text>
              ) : null}
            </View>

            {groups.map((group) => (
              <MomentSection
                key={group.moment.key}
                desktop={desktop}
                accepts={(listId) => canMoveTo(listId, day, group.moment.key)}
                onDrop={(listId) => moveList(listId, day, group.moment.key)}
              >
                {/* Bandeau gris sur toute la largeur et corps plus grand que
                    celui des tâches (demande de Yann) : le moment structure
                    la journée, il doit se lire avant ce qu'il contient.
                    `bg-border` et non `bg-muted` : ce dernier vaut la teinte
                    de fond des surfaces, quasi blanche, et le bandeau ne se
                    détachait presque pas de la carte du jour. */}
                <View className="bg-border rounded-md px-2 py-1">
                  <Text className="text-foreground text-[15px] font-semibold uppercase">
                    {group.moment.label}
                  </Text>
                </View>
                {group.lists.map((list) => {
                  const saved = savedLists?.find((candidate) => candidate.id === list.id);
                  const dueOn = dueOnForDay(saved ?? list, day);
                  return (
                    <DueList
                      key={`${list.id}-${dueOn ?? "due"}`}
                      list={list}
                      saved={saved}
                      movable={saved !== undefined && saved.dueAt === list.dueAt}
                      {...(dueOn ? { dueOn } : {})}
                      desktop={desktop}
                      onOpenTask={setOpenedTask}
                      onEditList={(target) => setListTarget({ mode: "edit", list: target })}
                      onDeleteList={setDeletingList}
                    />
                  );
                })}
              </MomentSection>
            ))}
          </View>
        );
      })}

      <TaskListDialog target={listTarget} onClose={() => setListTarget(null)} />
      <TaskListDeleteDialog list={deletingList} onClose={() => setDeletingList(null)} />
      <TaskDialog task={editedTask} onClose={() => setOpenedTask(null)} />
    </View>
  );
}

/** Un moment d'un jour, cible de dépôt d'une liste. */
function MomentSection({
  desktop,
  accepts,
  onDrop,
  children,
}: {
  desktop: boolean;
  accepts: (listId: string) => boolean;
  onDrop: (listId: string) => void;
  children: React.ReactNode;
}) {
  const zoneRef = useMomentDropZone(true, accepts, onDrop);
  return (
    <View ref={zoneRef} className={desktop ? "gap-1" : "gap-2"}>
      {children}
    </View>
  );
}

/**
 * Une liste échue ce jour-là, avec ce qu'elle contient.
 *
 * Le contenu est l'éditeur de Mes listes, pas un résumé : on y écrit, on y
 * coche et on y change l'ordre sans quitter le jour. `saved` est la liste
 * enregistrée — `list` peut n'en être que les tâches de ce jour, et les
 * envoyer seules effacerait le reste.
 */
function DueList({
  list,
  saved,
  movable,
  dueOn,
  desktop,
  onOpenTask,
  onEditList,
  onDeleteList,
}: {
  list: TaskListWithTasks;
  saved: TaskListWithTasks | undefined;
  /** Vrai quand l'entrée porte l'échéance de la liste elle-même, la seule qu'on déplace. */
  movable: boolean;
  /** Jour des lignes nouvelles — absent quand c'est déjà l'échéance de la liste. */
  dueOn?: string;
  desktop: boolean;
  onOpenTask: (task: Task) => void;
  onEditList: (list: TaskList) => void;
  onDeleteList: (list: TaskList) => void;
}) {
  const shopping = list.kind === "shopping";
  const time = timeLabel(list);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // Le glisser-déposer n'existe que sur le web : sans lui, la poignée serait
  // un décor qui ne fait rien.
  const draggable = movable && Platform.OS === "web";
  const { cardRef, gripRef } = useListDragHandle(list.id, draggable);
  const source = saved ?? list;
  const subset = saved !== undefined && isTaskSubset(saved, list);

  const items: ContextMenuItem[] = [
    {
      label: "Modifier la liste",
      onPress: () => {
        setMenu(null);
        onEditList(source);
      },
    },
    {
      label: "Supprimer la liste",
      destructive: true,
      onPress: () => {
        setMenu(null);
        onDeleteList(source);
      },
    },
  ];

  return (
    <View
      ref={cardRef}
      className={`border-border gap-0.5 rounded-lg border border-dashed ${desktop ? "p-1.5" : "p-2"}`}
    >
      <View className="flex-row items-center gap-1">
        {draggable ? (
          <View
            ref={gripRef}
            accessibilityLabel={`Déplacer ${list.title}`}
            className="size-6 items-center justify-center"
          >
            <Icon as={GripVertical} size={14} className="text-muted-foreground" />
          </View>
        ) : null}
        {/* L'heure précède le titre, comme dans un agenda papier : c'est elle
            qui situe la liste dans le moment, avant ce qu'elle contient. */}
        <Icon
          as={shopping ? ShoppingBasket : ListChecks}
          size={14}
          className="text-muted-foreground"
        />
        {time ? <Text className="text-sm font-bold">{time}</Text> : null}
        <Text className="min-w-0 flex-1 text-sm font-medium" numberOfLines={1}>
          {list.title}
        </Text>

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
      </View>

      {saved ? (
        <TaskListEditor
          list={saved}
          query=""
          onOpenTask={onOpenTask}
          {...(subset ? { visibleTaskIds: list.tasks.map((task) => task.id) } : {})}
          {...(dueOn ? { dueOnForNew: dueOn } : {})}
        />
      ) : (
        list.tasks.map((task) => <TaskRow key={task.id} task={task} />)
      )}

      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />
      ) : null}
    </View>
  );
}

/** La carte du jour ne montre-t-elle qu'une partie des tâches de la liste ? */
function isTaskSubset(saved: TaskListWithTasks, shown: TaskListWithTasks): boolean {
  if (saved.tasks.length !== shown.tasks.length) return true;
  const ids = new Set(shown.tasks.map((task) => task.id));
  return saved.tasks.some((task) => !ids.has(task.id));
}

/**
 * Heure de l'échéance, quand elle en vise une.
 *
 * Une échéance « dans la journée » n'en affiche pas — c'est déjà ce que dit
 * l'intitulé du moment, et l'écrire « 0h » ferait croire à une échéance
 * nocturne.
 */
function timeLabel(list: TaskListWithTasks): string | undefined {
  if (list.dueAt === null || list.dueAllDay !== false) return undefined;
  return formatTime(list.dueAt);
}
