import { Pressable, View } from "react-native";
import type { CalendarEvent } from "@jc/domain";
import { Text } from "@/shared/ui/text";
import { eventsOfDay, formatTime, isSameDay, WEEKDAY_LABELS } from "./lib/calendar-dates";

export type MonthGridProps = {
  /** Les 42 jours de la grille, lundi en tête. */
  days: Date[];
  /** Mois mis en avant ; les jours des mois voisins sont atténués. */
  anchor: Date;
  events: CalendarEvent[];
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

          return (
            <Pressable
              key={day.toISOString()}
              onPress={() => onSelectDay(day)}
              accessibilityRole="button"
              accessibilityLabel={`${day.getDate()}, ${dayEvents.length} événement(s)`}
              accessibilityState={{ selected }}
              style={{ width: `${100 / 7}%`, height: compact ? 64 : 96 }}
              className={`border-border gap-1 border-b border-r p-1 ${
                selected ? "bg-accent-soft" : ""
              }`}
            >
              <View className="flex-row justify-end">
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
                <View className="flex-row flex-wrap gap-0.5">
                  {dayEvents.slice(0, MAX_PILLS_PER_CELL).map((event) => (
                    <View key={event.id} className="bg-primary h-1.5 w-1.5 rounded-full" />
                  ))}
                </View>
              ) : (
                <View className="gap-0.5">
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
                    <Text className="text-muted-foreground px-1 text-[11px]">
                      +{dayEvents.length - MAX_PILLS_PER_CELL}
                    </Text>
                  ) : null}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
