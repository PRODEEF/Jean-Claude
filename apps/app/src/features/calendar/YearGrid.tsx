import { useMemo } from "react";
import { Pressable, View } from "react-native";
import type { CalendarEvent } from "@jc/domain";
import { Text } from "@/shared/ui/text";
import { isSameDay, monthGrid, monthName, monthsOfYear } from "@/shared/lib/dates";

export type YearGridProps = {
  /** Année affichée ; seul le millésime compte. */
  anchor: Date;
  events: CalendarEvent[];
  /** Ouvre le mois choisi — la vue année sert à viser, pas à lire le détail. */
  onSelectMonth: (month: Date) => void;
};

/** Initiales des jours, lundi en tête. Une lettre : la vignette fait 7 colonnes étroites. */
const WEEKDAY_INITIALS = ["L", "M", "M", "J", "V", "S", "D"] as const;

/**
 * Vue année : douze vignettes de mois.
 *
 * Elle ne montre pas les événements mais leur présence — un jour occupé est
 * mis en avant, le reste s'ouvre d'un appui sur le mois. C'est le parti du
 * Calendrier iOS et de Fantastical (§4.2) : à cette échelle, un titre ne tient
 * pas dans une cellule de 14 pt.
 */
export function YearGrid({ anchor, events, onSelectMonth }: YearGridProps) {
  const today = new Date();

  // Un événement long n'est marqué qu'à son jour de début : à l'échelle de
  // l'année, la pastille dit « il se passe quelque chose », pas la durée.
  const busyDays = useMemo(
    () => new Set(events.map((event) => dayKey(new Date(event.startsAt)))),
    [events],
  );

  return (
    <View className="flex-row flex-wrap">
      {monthsOfYear(anchor).map((month) => (
        <Pressable
          key={month.toISOString()}
          onPress={() => onSelectMonth(month)}
          accessibilityRole="button"
          accessibilityLabel={`Ouvrir ${monthName(month)} ${month.getFullYear()}`}
          className="w-1/2 gap-1 p-2 sm:w-1/3 lg:w-1/4"
        >
          <Text
            className={`text-sm font-semibold ${
              month.getMonth() === today.getMonth() && month.getFullYear() === today.getFullYear()
                ? "text-primary"
                : "text-foreground"
            }`}
          >
            {monthName(month)}
          </Text>

          <View className="flex-row">
            {WEEKDAY_INITIALS.map((initial, index) => (
              <View key={`${initial}-${index}`} className="w-[14.28%] items-center">
                <Text className="text-muted-foreground text-[10px]">{initial}</Text>
              </View>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {monthGrid(month).map((day) => {
              const isToday = isSameDay(day, today);

              return (
                <View
                  key={day.toISOString()}
                  className="h-5 w-[14.28%] items-center justify-center"
                >
                  {/* Les jours des mois voisins sont laissés vides : à cette
                      taille, les atténuer ne suffit plus à les distinguer. */}
                  {day.getMonth() === month.getMonth() ? (
                    <Text
                      className={`text-[10px] ${
                        isToday
                          ? "bg-primary text-primary-foreground h-4 w-4 rounded-full text-center leading-4"
                          : busyDays.has(dayKey(day))
                            ? "text-primary font-semibold"
                            : "text-foreground"
                      }`}
                    >
                      {day.getDate()}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/** Identifie un jour dans le fuseau de l'appareil, sans passer par un horodatage. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
