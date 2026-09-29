import { Pressable, StyleSheet, View, type GestureResponderEvent } from "react-native";
import type { CalendarEntry, TaskListWithTasks } from "@jc/domain";
import { eventsOfDay, layoutDayEvents, layoutDayLists, listsOfDay } from "@jc/domain";
import { Text } from "@/shared/ui/text";
import { eventLabel, SharedMark } from "./MonthGrid";
import { formatDayLabel, formatTime, isSameDay } from "@/shared/lib/dates";

export type TimeGridProps = {
  /** Les jours à mettre en colonnes : un seul en vue jour, sept en vue semaine. */
  days: Date[];
  events: CalendarEntry[];
  /** Todolistes échues, en bandeau au-dessus de la grille : elles chargent le jour. */
  lists: TaskListWithTasks[];
  onOpenEvent: (event: CalendarEntry) => void;
  /** Ouvre le détail cochable d'une liste posée dans le bandeau ou la grille. */
  onOpenList: (list: TaskListWithTasks) => void;
  /**
   * Appui sur un créneau libre — la minute est celle visée dans la colonne,
   * absente quand le geste ne dit pas où il a eu lieu (activation au clavier).
   */
  onCreateAt: (day: Date, minute?: number) => void;
};

const HOUR_HEIGHT = 48;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** Colonne des heures, à gauche de la grille. */
const GUTTER_WIDTH = 44;

/** En deçà, le titre d'un rendez-vous court n'est plus lisible. */
const MIN_EVENT_HEIGHT = 18;

/** Au-delà, le bandeau des tâches repousserait la grille hors de l'écran. */
const MAX_TASKS_PER_COLUMN = 3;

/**
 * Grille horaire, d'un jour ou d'une semaine.
 *
 * Une colonne par jour et une échelle d'heures : c'est la forme commune au
 * Calendrier iOS, à Google Calendar et à Fantastical (§4.2), et la vue jour
 * n'en est que le cas à une colonne. La journée entière est sortie de
 * l'échelle, en bandeau sous les jours — la placer à minuit laisserait croire
 * à un événement de début de nuit.
 */
export function TimeGrid({
  days,
  events,
  lists,
  onOpenEvent,
  onOpenList,
  onCreateAt,
}: TimeGridProps) {
  const today = new Date();

  const perDay = days.map((day) => {
    const dayEvents = eventsOfDay(events, day);
    // Une todoliste à heure précise se place comme un rendez-vous ; sans
    // heure, elle reste dans le bandeau plat au-dessus de la grille.
    const { timed: timedLists, untimed: dayLists } = layoutDayLists(listsOfDay(lists, day), day);
    return {
      day,
      allDay: dayEvents.filter((event) => event.allDay),
      timed: layoutDayEvents(dayEvents, day),
      timedLists,
      lists: dayLists,
    };
  });

  const hasAllDay = perDay.some((column) => column.allDay.length > 0);
  const hasTasks = perDay.some((column) => column.lists.length > 0);

  return (
    <View className="border-border overflow-hidden rounded-xl border">
      <View className="border-border flex-row border-b">
        <View style={{ width: GUTTER_WIDTH }} />
        {days.map((day) => (
          <View key={day.toISOString()} className="border-border flex-1 items-center border-l py-2">
            <Text
              className={`text-xs ${
                isSameDay(day, today) ? "text-primary font-semibold" : "text-muted-foreground"
              }`}
            >
              {formatDayLabel(day)}
            </Text>
          </View>
        ))}
      </View>

      {hasAllDay ? (
        <View className="border-border flex-row border-b">
          <View style={{ width: GUTTER_WIDTH }} className="justify-center px-1">
            <Text className="text-muted-foreground text-[10px]">journée</Text>
          </View>
          {perDay.map((column) => (
            <View
              key={column.day.toISOString()}
              className="border-border min-h-8 flex-1 gap-0.5 border-l p-0.5"
            >
              {column.allDay.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => onOpenEvent(event)}
                  accessibilityRole="button"
                  accessibilityLabel={eventLabel(event)}
                  className="bg-accent-soft flex-row items-center gap-0.5 rounded px-1 py-0.5"
                >
                  {event.space ? <SharedMark /> : null}
                  <Text
                    numberOfLines={1}
                    className="text-accent-soft-foreground flex-1 text-[11px] leading-4"
                  >
                    {event.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {/* Les tâches ont leur propre bandeau, au-dessus des heures : une tâche
          « pour jeudi » n'occupe pas un créneau, mais elle pèse sur la journée
          et doit se voir sans changer d'onglet. */}
      {hasTasks ? (
        <View className="border-border flex-row border-b">
          <View style={{ width: GUTTER_WIDTH }} className="justify-center px-1">
            <Text className="text-muted-foreground text-[10px]">listes</Text>
          </View>
          {perDay.map((column) => (
            <View
              key={column.day.toISOString()}
              className="border-border min-h-8 flex-1 gap-0.5 border-l p-0.5"
            >
              {column.lists.slice(0, MAX_TASKS_PER_COLUMN).map((list) => (
                <Pressable
                  key={list.id}
                  onPress={() => onOpenList(list)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ouvrir la liste ${list.title}`}
                  className="bg-muted rounded px-1 py-0.5"
                >
                  <Text numberOfLines={1} className="text-muted-foreground text-[11px] leading-4">
                    {list.title}
                  </Text>
                </Pressable>
              ))}
              {column.lists.length > MAX_TASKS_PER_COLUMN ? (
                <Text className="text-muted-foreground px-1 text-[10px]">
                  +{column.lists.length - MAX_TASKS_PER_COLUMN}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View className="flex-row" style={{ height: HOURS.length * HOUR_HEIGHT }}>
        <View style={{ width: GUTTER_WIDTH }}>
          {HOURS.map((hour) => (
            <View key={hour} style={{ height: HOUR_HEIGHT }} className="items-end pr-1 pt-0.5">
              <Text className="text-muted-foreground text-[10px]">{hour}h</Text>
            </View>
          ))}
        </View>

        {perDay.map((column) => (
          <View key={column.day.toISOString()} className="border-border flex-1 border-l">
            {HOURS.map((hour) => (
              <View
                key={hour}
                style={{ height: HOUR_HEIGHT }}
                className={hour === 0 ? "" : "border-border border-t"}
              />
            ))}

            {/* Posé avant les événements : ceux-ci sont plus haut dans la
                pile et captent l'appui qui les vise. */}
            <Pressable
              style={StyleSheet.absoluteFill}
              accessibilityRole="button"
              accessibilityLabel={`Ajouter un événement le ${formatDayLabel(column.day)}`}
              onPress={(gesture) => {
                const y = pressOffsetY(gesture);
                if (y === null) onCreateAt(column.day);
                else onCreateAt(column.day, clampHour(Math.floor(y / HOUR_HEIGHT)) * 60);
              }}
            />

            {/* Todolistes échues à heure précise : même placement que les
                événements. L'appui ouvre le détail cochable, comme Google
                Calendar ouvre la fiche d'un rendez-vous (§4.2). */}
            {column.timedLists.map((box) => (
              <Pressable
                key={box.list.id}
                onPress={() => onOpenList(box.list)}
                accessibilityRole="button"
                accessibilityLabel={`Ouvrir la liste ${box.list.title}`}
                className="bg-muted absolute overflow-hidden rounded px-1 py-0.5"
                style={{
                  top: (box.startMinute / 60) * HOUR_HEIGHT,
                  height: Math.max(
                    ((box.endMinute - box.startMinute) / 60) * HOUR_HEIGHT,
                    MIN_EVENT_HEIGHT,
                  ),
                  left: `${(box.lane / box.laneCount) * 100}%`,
                  width: `${100 / box.laneCount}%`,
                }}
              >
                <Text numberOfLines={1} className="text-muted-foreground text-[11px] leading-4">
                  {box.list.title}
                </Text>
              </Pressable>
            ))}

            {column.timed.map((box) => (
              <Pressable
                key={box.event.id}
                onPress={() => onOpenEvent(box.event)}
                accessibilityRole="button"
                accessibilityLabel={eventLabel(box.event)}
                className="bg-accent-soft border-primary absolute overflow-hidden rounded border-l-2 px-1 py-0.5"
                style={{
                  top: (box.startMinute / 60) * HOUR_HEIGHT,
                  height: Math.max(
                    ((box.endMinute - box.startMinute) / 60) * HOUR_HEIGHT,
                    MIN_EVENT_HEIGHT,
                  ),
                  left: `${(box.lane / box.laneCount) * 100}%`,
                  width: `${100 / box.laneCount}%`,
                }}
              >
                <View className="flex-row items-center gap-0.5">
                  {box.event.space ? <SharedMark /> : null}
                  <Text
                    numberOfLines={1}
                    className="text-accent-soft-foreground flex-1 text-[11px] leading-4"
                  >
                    {box.event.title}
                  </Text>
                </View>
                <Text numberOfLines={1} className="text-muted-foreground text-[10px] leading-3">
                  {formatTime(box.event.startsAt)}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Ordonnée de l'appui dans la colonne, ou `null` si le geste n'en porte pas.
 *
 * Sur iOS et Android, `onPress` reçoit un événement tactile qui porte
 * `locationY`. Sur le web, react-native-web lui passe l'événement `click` du
 * navigateur, qui n'a pas ce champ mais `offsetY` — relatif à la zone d'appui,
 * qui couvre toute la colonne. Lire `locationY` seul préremplissait donc le
 * formulaire à « NaN:00 » sur le web. Un appui au clavier n'a ni l'un ni
 * l'autre.
 */
function pressOffsetY(gesture: GestureResponderEvent): number | null {
  const native: object = gesture.nativeEvent;
  if ("locationY" in native && typeof native.locationY === "number" && Number.isFinite(native.locationY)) {
    return native.locationY;
  }
  if ("offsetY" in native && typeof native.offsetY === "number" && Number.isFinite(native.offsetY)) {
    return native.offsetY;
  }
  return null;
}

function clampHour(hour: number): number {
  return Math.min(Math.max(hour, 0), HOURS.length - 1);
}
