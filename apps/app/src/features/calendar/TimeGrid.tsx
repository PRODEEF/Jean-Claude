import { Pressable, StyleSheet, View } from "react-native";
import type { CalendarEvent } from "@jc/domain";
import { Text } from "@/shared/ui/text";
import {
  eventsOfDay,
  formatDayLabel,
  formatTime,
  isSameDay,
  layoutDayEvents,
} from "./lib/calendar-dates";

export type TimeGridProps = {
  /** Les jours à mettre en colonnes : un seul en vue jour, sept en vue semaine. */
  days: Date[];
  events: CalendarEvent[];
  onOpenEvent: (event: CalendarEvent) => void;
  /** Appui sur un créneau libre — la minute est celle visée dans la colonne. */
  onCreateAt: (day: Date, minute: number) => void;
  /**
   * Distance entre le haut de la grille et la première heure ouvrée.
   *
   * La grille ne défile plus d'elle-même — c'est la page qui défile — et seul
   * son parent peut donc la cadrer sur le matin. Il lui manque pour cela la
   * hauteur des bandeaux de tête, mesurée ici.
   */
  onMorningOffset?: (offset: number) => void;
};

const HOUR_HEIGHT = 48;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** Colonne des heures, à gauche de la grille. */
const GUTTER_WIDTH = 44;

/** La grille s'ouvre sur le matin plutôt qu'à minuit, comme les trois références. */
const INITIAL_HOUR = 7;

/** En deçà, le titre d'un rendez-vous court n'est plus lisible. */
const MIN_EVENT_HEIGHT = 18;

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
  onOpenEvent,
  onCreateAt,
  onMorningOffset,
}: TimeGridProps) {
  const today = new Date();

  const perDay = days.map((day) => {
    const dayEvents = eventsOfDay(events, day);
    return {
      day,
      allDay: dayEvents.filter((event) => event.allDay),
      timed: layoutDayEvents(dayEvents, day),
    };
  });

  const hasAllDay = perDay.some((column) => column.allDay.length > 0);

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
                  accessibilityLabel={`Modifier ${event.title}`}
                  className="bg-accent-soft rounded px-1 py-0.5"
                >
                  <Text
                    numberOfLines={1}
                    className="text-accent-soft-foreground text-[11px] leading-4"
                  >
                    {event.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      <View
        className="flex-row"
        style={{ height: HOURS.length * HOUR_HEIGHT }}
        onLayout={(event) =>
          onMorningOffset?.(event.nativeEvent.layout.y + INITIAL_HOUR * HOUR_HEIGHT)
        }
      >
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
              onPress={(gesture) =>
                onCreateAt(column.day, Math.floor(gesture.nativeEvent.locationY / HOUR_HEIGHT) * 60)
              }
            />

            {column.timed.map((box) => (
              <Pressable
                key={box.event.id}
                onPress={() => onOpenEvent(box.event)}
                accessibilityRole="button"
                accessibilityLabel={`Modifier ${box.event.title}`}
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
                <Text
                  numberOfLines={1}
                  className="text-accent-soft-foreground text-[11px] leading-4"
                >
                  {box.event.title}
                </Text>
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
