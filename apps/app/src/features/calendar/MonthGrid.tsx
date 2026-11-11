import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Check, ListChecks, Users } from "lucide-react-native";
import type { CalendarEntry, TaskListWithTasks } from "@jc/domain";
import { dayTaskState, eventsOfDay } from "@jc/domain";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { formatTime, isSameDay, WEEKDAY_LABELS } from "@/shared/lib/dates";

export type MonthGridProps = {
  /** Les 42 jours de la grille, lundi en tête. */
  days: Date[];
  /** Mois mis en avant ; les jours des mois voisins sont atténués. */
  anchor: Date;
  events: CalendarEntry[];
  /** Todolistes échues, toutes listes confondues : ce qui charge la journée (A.2). */
  lists: TaskListWithTasks[];
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  onOpenEvent: (event: CalendarEntry) => void;
  /**
   * Ouvre les tâches d'un jour. Absent quand le volet de droite n'existe pas
   * (téléphone) : le repère « N tâches » reste alors un simple repère.
   */
  onOpenDayTasks?: (day: Date) => void;
  /** En deçà du point de rupture : pastilles au lieu des titres. */
  compact: boolean;
};

/** Ce qu'une cellule tient sous son numéro de jour : au-delà, elle déborde. */
const MAX_LINES_PER_CELL = 3;

/**
 * Grille mensuelle.
 *
 * Les noms de jours restent en tête. Ce sont les semaines qui défilent, dans
 * le cadre : le haut de la grille ne quitte pas l'écran.
 *
 * En `compact`, les titres cèdent la place à des pastilles : un titre dans une
 * cellule étroite se tronque au deuxième caractère (§4.2).
 */
export function MonthGrid({
  days,
  anchor,
  events,
  lists,
  selectedDay,
  onSelectDay,
  onOpenEvent,
  onOpenDayTasks,
  compact,
}: MonthGridProps) {
  const today = new Date();

  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));

  return (
    <View className="border-border min-h-0 flex-1 overflow-hidden rounded-xl border">
      <View className="border-border flex-row border-b">
        {WEEKDAY_LABELS.map((label) => (
          <View key={label} className="flex-1 px-2 py-2">
            <Text className="text-muted-foreground text-xs">{label}</Text>
          </View>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
      <View className="min-h-full flex-1">
        {weeks.map((week) => (
          <View key={week[0]?.toISOString()} className="flex-1 flex-row" style={{ minHeight: compact ? 64 : 96 }}>
        {week.map((day) => {
          const outside = day.getMonth() !== anchor.getMonth();
          const isToday = isSameDay(day, today);
          const selected = isSameDay(day, selectedDay);
          const dayEvents = eventsOfDay(events, day);
          // Ce qui reste à faire ne charge plus la journée une fois coché, mais
          // la journée ne disparaît pas pour autant : elle se montre « faite ».
          const { open: dayTasks, allDone: dayDone } = dayTaskState(lists, day);
          const hasTaskBadge = dayTasks > 0 || dayDone;
          const { shown, hidden } = fitEvents(dayEvents, hasTaskBadge);

          return (
            <View
              key={day.toISOString()}
              className={`border-border min-w-0 flex-1 gap-1 border-b border-r p-1 ${
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

              <View className="flex-row justify-end" style={{ pointerEvents: "none" }}>
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
                <View
                  className="flex-row flex-wrap items-center gap-0.5"
                  style={{ pointerEvents: "none" }}
                >
                  {dayEvents.slice(0, MAX_LINES_PER_CELL).map((event) => (
                    <View key={event.id} className="bg-primary h-1.5 w-1.5 rounded-full" />
                  ))}
                  {hasTaskBadge ? <TaskBadge count={dayTasks} done={dayDone} compact /> : null}
                </View>
              ) : (
                // `box-none` et non `none` : la colonne elle-même laisse
                // passer l'appui vers le sélecteur de jour, mais les
                // rendez-vous qu'elle porte restent pressables.
                <View className="gap-0.5" style={{ pointerEvents: "box-none" }}>
                  {/* Avant les rendez-vous : au-delà de trois lignes la cellule
                      déborde, et la charge de la journée doit rester visible. */}
                  {hasTaskBadge ? (
                    <TaskBadge
                      count={dayTasks}
                      done={dayDone}
                      {...(onOpenDayTasks ? { onPress: () => onOpenDayTasks(day) } : {})}
                    />
                  ) : null}
                  {shown.map((event) => (
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
                        {event.allDay
                          ? event.title
                          : `${formatTime(event.startsAt)} ${event.title}`}
                      </Text>
                    </Pressable>
                  ))}
                  {hidden > 0 ? (
                    <View style={{ pointerEvents: "none" }}>
                      <Text className="text-muted-foreground px-1 text-[11px]">+{hidden}</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          );
        })}
          </View>
        ))}
      </View>
      </ScrollView>
    </View>
  );
}

/**
 * Ce qu'une cellule montre de ses rendez-vous, et ce qu'elle en tait.
 *
 * La pastille de tâches occupe une ligne au même titre qu'un rendez-vous, et le
 * « +N » aussi : les compter dans le même budget est ce qui empêche une journée
 * chargée de déborder de sa cellule.
 */
function fitEvents(
  events: CalendarEntry[],
  hasTaskBadge: boolean,
): { shown: CalendarEntry[]; hidden: number } {
  const room = MAX_LINES_PER_CELL - (hasTaskBadge ? 1 : 0);
  const shown = events.length <= room ? events : events.slice(0, Math.max(room - 1, 0));
  return { shown, hidden: events.length - shown.length };
}

/**
 * Ce qu'une journée porte de tâches à faire.
 *
 * Un compte et non les titres : la cellule est déjà partagée avec les
 * rendez-vous, et c'est la charge de la journée qu'on lit d'un coup d'œil dans
 * une grille mensuelle.
 */
function TaskBadge({
  count,
  done = false,
  compact,
  onPress,
}: {
  count: number;
  /** Tout est coché : le repère reste, sous sa forme « fait ». */
  done?: boolean;
  compact?: boolean;
  onPress?: () => void;
}) {
  if (compact) {
    return (
      <View className="flex-row items-center gap-0.5" style={{ pointerEvents: "none" }}>
        <Icon as={done ? Check : ListChecks} size={10} className="text-muted-foreground" />
        {done ? null : <Text className="text-muted-foreground text-[10px]">{count}</Text>}
      </View>
    );
  }

  const label = done ? "Tout est fait" : count === 1 ? "1 tâche" : `${count} tâches`;
  const content = (
    <>
      <Icon as={done ? Check : ListChecks} size={10} className="text-muted-foreground" />
      <Text className="text-muted-foreground text-[11px] leading-4">{label}</Text>
    </>
  );

  // Cliquable seulement quand il y a un volet où montrer ces tâches.
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={done ? "Voir les tâches faites" : `Voir les ${label}`}
        className="border-border flex-row items-center gap-1 rounded border px-1 py-0.5"
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      className="border-border flex-row items-center gap-1 rounded border px-1 py-0.5"
      style={{ pointerEvents: "none" }}
    >
      {content}
    </View>
  );
}

/**
 * Marque d'un événement d'espace : il est au calendrier de tous les membres
 * d'une conversation, pas seulement au sien.
 */
export function SharedMark() {
  return <Icon as={Users} size={10} className="text-accent-soft-foreground" />;
}

/** Libellé lu par un lecteur d'écran : l'espace, quand l'événement est partagé. */
export function eventLabel(event: CalendarEntry): string {
  return event.space
    ? `Modifier ${event.title}, ${event.space.workspaceName} · ${event.space.groupTitle}`
    : `Modifier ${event.title}`;
}
