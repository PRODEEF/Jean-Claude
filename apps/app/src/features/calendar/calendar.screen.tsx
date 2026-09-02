import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Plus } from "lucide-react-native";
import type { CalendarEvent } from "@jc/domain";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { CalendarToolbar, type CalendarView } from "./CalendarToolbar";
import { DayAgenda } from "./DayAgenda";
import { EventFormDialog, type EventDialogTarget } from "./EventFormDialog";
import { MonthGrid } from "./MonthGrid";
import { WeekGrid } from "./WeekGrid";
import { useCalendarEvents } from "./hooks/use-calendar-events";
import {
  addDays,
  addMonths,
  monthGrid,
  monthLabel,
  rangeOf,
  startOfDay,
  startOfWeek,
  weekDays,
  weekLabel,
} from "./lib/calendar-dates";

/** Heure par défaut d'un événement créé sans viser de créneau. */
const DEFAULT_CREATE_MINUTE = 9 * 60;

/**
 * Calendrier — vues mois et semaine (§3, Phase B).
 *
 * Les deux vues n'appellent pas deux routes différentes : elles demandent deux
 * fenêtres à la même. Changer de vue ou de période ne fait donc que déplacer
 * les bornes, et le mois déjà consulté revient du cache.
 */
export function CalendarScreen() {
  const compact = useBreakpoint() === "compact";

  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [dialogTarget, setDialogTarget] = useState<EventDialogTarget | null>(null);

  const days = useMemo(
    () => (view === "month" ? monthGrid(anchor) : weekDays(anchor)),
    [view, anchor],
  );
  const range = useMemo(() => rangeOf(days), [days]);
  const { data, isPending, isError } = useCalendarEvents(range);
  const events = data ?? [];

  // La sélection suit la période affichée : sans cela, la liste du jour
  // resterait sur septembre alors que la grille montre octobre — le contresens
  // est immédiat sur téléphone, où c'est elle qui porte le détail.
  const shift = (direction: 1 | -1) => {
    const next = view === "month" ? addMonths(anchor, direction) : addDays(anchor, 7 * direction);
    setAnchor(next);
    setSelectedDay(view === "month" ? startOfDay(next) : startOfWeek(next));
  };

  const goToToday = () => {
    const today = new Date();
    setAnchor(today);
    setSelectedDay(startOfDay(today));
  };

  const openEvent = (event: CalendarEvent) => setDialogTarget({ mode: "edit", event });

  return (
    <View className="bg-background flex-1">
      <View className="w-full max-w-[1100px] flex-1 gap-4 self-center p-6">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-2xl font-semibold">Calendrier</Text>
          <Button
            size="sm"
            onPress={() =>
              setDialogTarget({ mode: "create", day: selectedDay, minute: DEFAULT_CREATE_MINUTE })
            }
            accessibilityRole="button"
            accessibilityLabel="Nouvel événement"
          >
            <Icon as={Plus} className="size-4" />
            <Text>Événement</Text>
          </Button>
        </View>

        <CalendarToolbar
          label={view === "month" ? monthLabel(anchor) : weekLabel(anchor)}
          view={view}
          onViewChange={setView}
          onPrevious={() => shift(-1)}
          onNext={() => shift(1)}
          onToday={goToToday}
        />

        {isError ? (
          <Text className="text-destructive text-sm">
            Le calendrier n'a pas pu être chargé. Réessayez dans un instant.
          </Text>
        ) : null}

        {view === "month" ? (
          <ScrollView contentContainerClassName="gap-4 pb-6">
            <MonthGrid
              days={days}
              anchor={anchor}
              events={events}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              onOpenEvent={openEvent}
              compact={compact}
            />
            <DayAgenda day={selectedDay} events={events} onOpenEvent={openEvent} />
          </ScrollView>
        ) : (
          <WeekGrid
            days={days}
            events={events}
            onOpenEvent={openEvent}
            onCreateAt={(day, minute) => setDialogTarget({ mode: "create", day, minute })}
          />
        )}

        {/* Sous la grille et non à sa place : le mois déjà chargé reste
            affiché pendant qu'on en récupère un autre, plutôt que de laisser
            un écran vide à chaque navigation. */}
        {isPending ? <Text className="text-muted-foreground text-xs">Chargement…</Text> : null}
      </View>

      <EventFormDialog target={dialogTarget} onClose={() => setDialogTarget(null)} />
    </View>
  );
}
