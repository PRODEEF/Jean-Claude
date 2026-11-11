import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { GripVertical, ListChecks, MoreHorizontal, Plus, ShoppingBasket } from "lucide-react-native";
import type { CalendarEntry, MomentKey, Task, TaskList, TaskListWithTasks } from "@jc/domain";
import {
  calendarDayOf,
  dayOfTask,
  dueForMoment,
  dueOnForDay,
  momentOf,
  momentsOfDay,
  openTaskCount,
  startOfDay,
} from "@jc/domain";
import { formatFullDay, formatTime, isSameDay } from "@/shared/lib/dates";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useDayPartBounds } from "@/shared/hooks/use-profile";
import { useTaskActions, useTaskLists } from "@/shared/hooks/use-task-lists";
import { TaskDialog } from "@/features/todo/TaskDialog";
import { ListDueDialog } from "@/features/todo/ListDueDialog";
import { TaskListDeleteDialog } from "@/features/todo/TaskListDeleteDialog";
import { TaskListDialog, type TaskListTarget } from "@/features/todo/TaskListDialog";
import { TaskListEditor } from "@/features/todo/TaskListEditor";
import { TaskRow } from "@/features/todo/TaskRow";
import { Button } from "@/shared/ui/button";
import { ContextMenu, type ContextMenuItem } from "@/shared/ui/context-menu";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { useListDragHandle, useMomentDropZone, type DayDrag } from "./lib/list-drag";

export type DueListsBoardProps = {
  /** Les jours à afficher, dans l'ordre — une semaine ou un mois selon l'appelant. */
  days: Date[];
  lists: TaskListWithTasks[];
  /**
   * Rendez-vous du mois, sans ceux qu'une todoliste porte déjà : cette liste
   * s'affiche elle-même, la montrer deux fois ferait doublon.
   */
  events: CalendarEntry[];
  onOpenEvent: (event: CalendarEntry) => void;
};

/**
 * Todolistes échues, un bloc par jour découpé en moments (A.2).
 *
 * Chaque liste s'édite comme dans Mes listes : une ligne par tâche, à cocher,
 * indenter et réordonner sur place. Les bandeaux matin, après-midi et soir
 * restent — c'est eux qui situent la journée, Mes listes ne les a pas. Les
 * rendez-vous s'y rangent aussi, au moment de leur heure : une journée chargée
 * de rendez-vous est une journée chargée.
 */
export function DueListsBoard({ days, lists, events, onOpenEvent }: DueListsBoardProps) {
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
  const { updateList, updateTask } = useTaskActions();
  const [moveFailure, setMoveFailure] = useState<string | null>(null);

  /**
   * Crée une liste sur un jour, au moment visé : la fenêtre s'ouvre déjà datée,
   * l'utilisateur n'a plus qu'à écrire le titre et ses tâches (§13.4.1).
   */
  const addList = (day: Date, moment: MomentKey) => {
    const due = dueForMoment(day, moment, { dueAt: null, dueAllDay: null }, bounds);
    setListTarget({ mode: "create", folderId: null, dueAt: due.dueAt, dueAllDay: due.dueAllDay });
  };
  /** Pas d'échéance dans le passé : le serveur la refuse, autant ne pas proposer le geste. */
  const canAddOn = (day: Date) => startOfDay(day).getTime() >= startOfDay(today).getTime();

  const fail = () => setMoveFailure("Le déplacement a échoué. Réessayez dans un instant.");

  /**
   * Dépose une liste ou une tâche sur un moment d'un jour. Seule l'échéance
   * d'une liste enregistrée se déplace : l'entrée recomposée pour le jour de
   * certaines de ses tâches n'a pas d'échéance à elle. Une tâche, elle, n'a
   * pas de créneau — le moment lâché ne compte pas, seul le jour.
   */
  const move = (drag: DayDrag, day: Date, moment: MomentKey) => {
    const saved = savedLists?.find((candidate) => candidate.id === drag.listId);
    if (!saved) return;
    setMoveFailure(null);

    if (drag.kind === "list") {
      updateList.mutate(
        { id: drag.listId, patch: dueForMoment(day, moment, saved, bounds) },
        { onError: fail },
      );
      return;
    }
    updateTask.mutate(
      { listId: drag.listId, taskId: drag.taskId, patch: { dueOn: dueOnForDay(saved, day) } },
      { onError: fail },
    );
  };

  /** Pas vers un jour révolu, pas vers la place qu'on occupe déjà. */
  const canMoveTo = (drag: DayDrag, day: Date, moment: MomentKey) => {
    const saved = savedLists?.find((candidate) => candidate.id === drag.listId);
    if (!saved) return false;
    if (startOfDay(day).getTime() < startOfDay(new Date()).getTime()) return false;

    if (drag.kind === "task") {
      const task = saved.tasks.find((candidate) => candidate.id === drag.taskId);
      return task !== undefined && dayOfTask(saved, task) !== calendarDayOf(day);
    }
    if (saved.dueAt === null) return false;
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
        const dayEvents = events
          .filter((event) => isSameDay(new Date(event.startsAt), day))
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        const eventMoment = (event: CalendarEntry) =>
          momentOf({ dueAt: event.startsAt, dueAllDay: event.allDay }, bounds);
        const groups = momentsOfDay(
          lists,
          day,
          bounds,
          new Set(dayEvents.map((event) => eventMoment(event))),
        );
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
                className={`text-sm font-bold uppercase ${
                  isToday ? "text-primary" : "text-foreground"
                }`}
              >
                {formatFullDay(day)}
              </Text>
              <View className="flex-row items-center gap-1">
                {remaining > 0 ? (
                  <Text className="text-muted-foreground text-xs">{remaining} à faire</Text>
                ) : null}
                {canAddOn(day) ? (
                  <AddListButton
                    label={`Ajouter une liste le ${formatFullDay(day)}`}
                    onPress={() => addList(day, "anytime")}
                  />
                ) : null}
              </View>
            </View>

            {groups.map((group) => (
              <MomentSection
                key={group.moment.key}
                desktop={desktop}
                accepts={(drag) => canMoveTo(drag, day, group.moment.key)}
                onDrop={(drag) => move(drag, day, group.moment.key)}
              >
                {/* Bandeau gris sur toute la largeur : le moment structure la
                    journée. Même corps que le reste, mais en minuscules : le
                    jour est seul en majuscules, c'est lui qu'on lit d'abord.
                    `bg-border` et non `bg-muted` : ce dernier vaut la teinte
                    de fond des surfaces, quasi blanche, et le bandeau ne se
                    détachait presque pas de la carte du jour. */}
                <View className="bg-secondary h-5 flex-row items-center justify-between rounded-md px-2">
                  <Text className="text-foreground text-xs font-semibold">
                    {group.moment.label}
                  </Text>
                  {canAddOn(day) ? (
                    <AddListButton
                      small
                      label={`Ajouter une liste, ${group.moment.label.toLowerCase()} du ${formatFullDay(day)}`}
                      onPress={() => addList(day, group.moment.key)}
                    />
                  ) : null}
                </View>
                {dayEvents
                  .filter((event) => eventMoment(event) === group.moment.key)
                  .map((event) => (
                    <EventLine key={event.id} event={event} onPress={() => onOpenEvent(event)} />
                  ))}
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

/**
 * « + » discret au bout d'une ligne : ajouter une liste à cet endroit.
 * `small` tient dans un bandeau de 20 pt ; la zone d'appui reste, elle, celle
 * d'un doigt (`hitSlop`).
 */
function AddListButton({
  label,
  onPress,
  small = false,
}: {
  label: string;
  onPress: () => void;
  small?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      hitSlop={small ? 12 : 8}
      onPress={onPress}
      accessibilityLabel={label}
      className={small ? "size-5" : "size-7"}
    >
      <Icon as={Plus} size={small ? 14 : 16} className="text-muted-foreground" />
    </Button>
  );
}

/** Un rendez-vous dans son moment : l'heure, puis le titre. Un appui l'ouvre. */
function EventLine({ event, onPress }: { event: CalendarEntry; onPress: () => void }) {
  const time = event.allDay ? null : formatTime(event.startsAt);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Rendez-vous ${event.title}${time ? `, à ${time}` : ""}`}
      className="bg-accent-soft flex-row items-center gap-2 rounded-md px-2 py-1"
    >
      {time ? <Text className="text-accent-soft-foreground text-sm font-bold">{time}</Text> : null}
      <Text className="text-accent-soft-foreground min-w-0 flex-1 text-sm" numberOfLines={1}>
        {event.title}
      </Text>
    </Pressable>
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
  accepts: (drag: DayDrag) => boolean;
  onDrop: (drag: DayDrag) => void;
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
  const [changingDue, setChangingDue] = useState(false);
  // Le glisser-déposer n'existe que sur le web : sans lui, la poignée serait
  // un décor qui ne fait rien.
  const draggable = movable && Platform.OS === "web";
  const { cardRef, gripRef } = useListDragHandle(list.id, draggable);
  const source = saved ?? list;
  const subset = saved !== undefined && isTaskSubset(saved, list);

  const items: ContextMenuItem[] = [
    // Le geste des téléphones, où le glisser-déposer n'existe pas : un menu sur
    // la liste, puis la date. Même fenêtre que depuis Mes listes.
    ...(movable
      ? [
          {
            label: "Changer l'échéance",
            onPress: () => {
              setMenu(null);
              setChangingDue(true);
            },
          },
        ]
      : []),
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
      {changingDue ? <ListDueDialog list={source} onClose={() => setChangingDue(false)} /> : null}
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
