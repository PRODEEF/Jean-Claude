import { Pressable, View } from "react-native";
import type { CalendarEvent } from "@jc/domain";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { Text } from "@/shared/ui/text";
import { eventsOfDay, formatFullDay, formatTime } from "./lib/calendar-dates";

export type DayAgendaProps = {
  day: Date;
  events: CalendarEvent[];
  onOpenEvent: (event: CalendarEvent) => void;
};

/**
 * Détail du jour sélectionné, sous la grille mensuelle.
 *
 * C'est ce qui rend la vue mois utilisable sur téléphone : la cellule ne porte
 * qu'une pastille, le contenu se lit ici (§4.2 — Calendrier iOS, Google
 * Calendar).
 */
export function DayAgenda({ day, events, onOpenEvent }: DayAgendaProps) {
  const dayEvents = eventsOfDay(events, day);

  return (
    <View className="gap-2">
      <Text className="text-muted-foreground text-xs uppercase">{formatFullDay(day)}</Text>

      {dayEvents.length === 0 ? (
        <Text className="text-muted-foreground text-sm">Rien de prévu ce jour-là.</Text>
      ) : (
        dayEvents.map((event) => (
          <Pressable
            key={event.id}
            onPress={() => onOpenEvent(event)}
            accessibilityRole="button"
            accessibilityLabel={`Modifier ${event.title}`}
            style={{ minHeight: MIN_TOUCH_TARGET }}
            className="border-border flex-row items-center gap-3 rounded-lg border px-3 py-2"
          >
            <Text className="text-muted-foreground w-14 text-xs">
              {event.allDay ? "journée" : formatTime(event.startsAt)}
            </Text>
            <View className="flex-1">
              <Text numberOfLines={1} className="text-sm font-medium">
                {event.title}
              </Text>
              {event.notes ? (
                <Text numberOfLines={1} className="text-muted-foreground text-xs">
                  {event.notes}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}
