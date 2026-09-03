import { Pressable, StyleSheet, View } from "react-native";
import { ListChecks } from "lucide-react-native";
import type { CalendarEvent, TaskListWithTasks } from "@jc/domain";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { eventsOfDay } from "./lib/calendar-dates";
import { formatTime, isSameDay, WEEKDAY_LABELS } from "@/shared/lib/dates";
import { listsOfDay, openTaskCount } from "@/shared/lib/tasks";

export type MonthGridProps = {
  /** Les 42 jours de la grille, lundi en tête. */
  days: Date[];
  /** Mois mis en avant ; les jours des mois voisins sont atténués. */
  anchor: Date;
  events: CalendarEvent[];
  /** Todolistes échues, toutes listes confondues : ce qui charge la journée (A.2). */
  lists: TaskListWithTasks[];
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  onOpenEvent: (event: CalendarEvent) => void;
  /** En deçà du point de rupture : pastilles au lieu des titres. */
  compact: boolean;
};

/** Au-delà, la cellule déborde : le reste se lit dans la liste du jour. */
const MAX_PILLS_PER_CELL = 3;

/**
 * Grille mensuelle.
 *
 * En `compact`, les titres cèdent la place à des pastilles et le détail passe
 * dans la liste du jour sélectionné : c'est le compromis retenu par le
 * Calendrier iOS et Google Calendar sur téléphone, où un titre dans une
 * cellule de 45 pt se tronque au deuxième caractère (§4.2).
 */
export function MonthGrid({
  days,
  anchor,
  events,
  lists,
  selectedDay,
  onSelectDay,
  onOpenEvent,
  compact,
}: MonthGridProps) {
  const today = new Date();

  return (
    <View className="border-border overflow-hidden rounded-xl border">
      <View className="border-border flex-row border-b">
        {WEEKDAY_LABELS.map((label) => (
          <View key={label} className="flex-1 px-2 py-2">
            <Text className="text-muted-foreground text-xs">{label}</Text>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {days.map((day) => {
          const outside = day.getMonth() !== anchor.getMonth();
          const isToday = isSameDay(day, today);
          const selected = isSameDay(day, selectedDay);
          const dayEvents = eventsOfDay(events, day);
          // Ce qui reste à faire, pas ce qui a été fait : une journée entièrement
          // cochée ne doit plus se signaler comme chargée.
          const dayTasks = listsOfDay(lists, day).reduce(
            (count, list) => count + openTaskCount(list),
            0,
          );

          return (
            <View
              key={day.toISOString()}
              style={{ width: `${100 / 7}%`, height: compact ? 64 : 96 }}
              className={`border-border gap-1 border-b border-r p-1 ${
                selected ? "bg-accent-soft" : ""
              }`}
            >
              {/* La cellule n'est pas elle-même pressable : elle porte les
                  rendez-vous, qui le sont, et un bouton dans un bouton n'est
                  pas du HTML valide. Le sélecteur de jour est donc posé en
                  fond — avant eux dans la pile, pour qu'ils captent l'appui
                  qui les vise — et le contenu inerte le laisse passer. */}
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => onSelectDay(day)}
                accessibilityRole="button"
                accessibilityLabel={`${day.getDate()}, ${dayEvents.length} événement(s), ${dayTasks} tâche(s) à faire`}
                accessibilityState={{ selected }}
              />

              <View pointerEvents="none" className="flex-row justify-end">
                <Text
                  className={`text-xs ${outside ? "text-muted-foreground" : "text-foreground"} ${
                    isToday
                      ? "bg-primary text-primary-foreground h-5 w-5 rounded-full text-center leading-5"
                      : ""
                  }`}
                >
                  {day.getDate()}
                </Text>
              </View>

              {compact ? (
                <View pointerEvents="none" className="flex-row flex-wrap items-center gap-0.5">
                  {dayEvents.slice(0, MAX_PILLS_PER_CELL).map((event) => (
                    <View key={event.id} className="bg-primary h-1.5 w-1.5 rounded-full" />
                  ))}
                  {dayTasks > 0 ? <TaskBadge count={dayTasks} compact /> : null}
                </View>
              ) : (
                // `box-none` et non `none` : la colonne elle-même laisse
                // passer l'appui vers le sélecteur de jour, mais les
                // rendez-vous qu'elle porte restent pressables.
                <View pointerEvents="box-none" className="gap-0.5">
                  {/* Avant les rendez-vous : au-delà de trois lignes la cellule
                      déborde, et la charge de la journée doit rester visible. */}
                  {dayTasks > 0 ? <TaskBadge count={dayTasks} /> : null}
                  {dayEvents.slice(0, MAX_PILLS_PER_CELL).map((event) => (
                    <Pressable
                      key={event.id}
                      onPress={() => onOpenEvent(event)}
                      accessibilityRole="button"
                      accessibilityLabel={`Modifier ${event.title}`}
                      className="bg-accent-soft rounded px-1 py-0.5"
                    >
                      <Text
                        numberOfLines={1}
                        className="text-accent-soft-foreground text-[11px] leading-4"
                      >
                        {event.allDay
                          ? event.title
                          : `${formatTime(event.startsAt)} ${event.title}`}
                      </Text>
                    </Pressable>
                  ))}
                  {dayEvents.length > MAX_PILLS_PER_CELL ? (
                    <View pointerEvents="none">
                      <Text className="text-muted-foreground px-1 text-[11px]">
                        +{dayEvents.length - MAX_PILLS_PER_CELL}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Ce qu'une journée porte de tâches à faire.
 *
 * Un compte et non les titres : la cellule est déjà partagée avec les
 * rendez-vous, et c'est la charge de la journée qu'on lit d'un coup d'œil dans
 * une grille mensuelle. Le détail se lit dans la liste du jour, en dessous.
 */
function TaskBadge({ count, compact }: { count: number; compact?: boolean }) {
  if (compact) {
    return (
      <View pointerEvents="none" className="flex-row items-center gap-0.5">
        <Icon as={ListChecks} size={10} className="text-muted-foreground" />
        <Text className="text-muted-foreground text-[10px]">{count}</Text>
      </View>
    );
  }

  return (
    <View
      pointerEvents="none"
      className="border-border flex-row items-center gap-1 rounded border px-1 py-0.5"
    >
      <Icon as={ListChecks} size={10} className="text-muted-foreground" />
      <Text className="text-muted-foreground text-[11px] leading-4">
        {count === 1 ? "1 tâche" : `${count} tâches`}
      </Text>
    </View>
  );
}
