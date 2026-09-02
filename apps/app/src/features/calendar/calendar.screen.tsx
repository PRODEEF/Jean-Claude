import { useMemo, useRef, useState } from "react";
import { ScrollView, View, type LayoutChangeEvent } from "react-native";
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
import { TimeGrid } from "./TimeGrid";
import { YearGrid } from "./YearGrid";
import { useCalendarEvents } from "./hooks/use-calendar-events";
import {
  addDays,
  addMonths,
  addYears,
  dayLabel,
  monthGrid,
  monthLabel,
  rangeOf,
  startOfDay,
  startOfWeek,
  weekDays,
  weekLabel,
  yearBounds,
  yearLabel,
} from "./lib/calendar-dates";

/** Heure par défaut d'un événement créé sans viser de créneau. */
const DEFAULT_CREATE_MINUTE = 9 * 60;

/**
 * Calendrier — vues jour, semaine, mois et année (§3, Phase B).
 *
 * Les quatre vues n'appellent pas quatre routes différentes : elles demandent
 * quatre fenêtres à la même. Changer de vue ou de période ne fait donc que
 * déplacer les bornes, et le mois déjà consulté revient du cache.
 *
 * Une seule zone défilante, celle de la page : les grilles se déroulent en
 * entier dedans. Une grille qui défilerait pour son compte emporterait sa
 * barre de défilement dans la largeur de ses colonnes, décalant celles-ci de
 * leurs en-têtes.
 */
export function CalendarScreen() {
  const compact = useBreakpoint() === "compact";

  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [dialogTarget, setDialogTarget] = useState<EventDialogTarget | null>(null);

  const days = useMemo(() => visibleDays(view, anchor), [view, anchor]);
  const range = useMemo(() => rangeOf(days), [days]);
  const { data, isPending, isError } = useCalendarEvents(range);
  const events = data ?? [];

  const page = useRef<ScrollView>(null);
  /** Position de la grille dans la page, et de la première heure ouvrée en son sein. */
  const gridTop = useRef(0);
  const morningOffset = useRef(0);
  const framePending = useRef(true);

  // Les deux mesures arrivent dans un ordre non garanti : le cadrage se joue
  // sur la seconde, quelle qu'elle soit. Sans lui, la vue jour et la vue
  // semaine s'ouvriraient sur sept heures de nuit vides.
  const frameMorning = () => {
    if (!framePending.current || morningOffset.current === 0) return;
    framePending.current = false;
    page.current?.scrollTo({ y: gridTop.current + morningOffset.current, animated: false });
  };

  const measureGrid = (event: LayoutChangeEvent) => {
    gridTop.current = event.nativeEvent.layout.y;
    frameMorning();
  };

  const measureMorning = (offset: number) => {
    morningOffset.current = offset;
    frameMorning();
  };

  const changeView = (next: CalendarView) => {
    if (next === "day" || next === "week") framePending.current = true;
    setView(next);
  };

  // La sélection suit la période affichée : sans cela, la liste du jour
  // resterait sur septembre alors que la grille montre octobre — le contresens
  // est immédiat sur téléphone, où c'est elle qui porte le détail.
  const shift = (direction: 1 | -1) => {
    const next = shiftAnchor(view, anchor, direction);
    setAnchor(next);
    if (view === "week") setSelectedDay(startOfWeek(next));
    else if (view !== "year") setSelectedDay(startOfDay(next));
  };

  const goToToday = () => {
    const today = new Date();
    setAnchor(today);
    setSelectedDay(startOfDay(today));
  };

  const openEvent = (event: CalendarEvent) => setDialogTarget({ mode: "edit", event });
  const createAt = (day: Date, minute: number) => setDialogTarget({ mode: "create", day, minute });

  return (
    <View className="bg-background flex-1">
      <ScrollView
        ref={page}
        className="flex-1"
        contentContainerClassName="w-full max-w-[1100px] gap-4 self-center p-6"
      >
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-2xl font-semibold">Calendrier</Text>
          <Button
            size="sm"
            onPress={() => createAt(selectedDay, DEFAULT_CREATE_MINUTE)}
            accessibilityRole="button"
            accessibilityLabel="Nouvel événement"
          >
            <Icon as={Plus} className="size-4" />
            <Text>Événement</Text>
          </Button>
        </View>

        <CalendarToolbar
          label={periodLabel(view, anchor)}
          view={view}
          onViewChange={changeView}
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
          <>
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
          </>
        ) : null}

        {view === "year" ? (
          <YearGrid
            anchor={anchor}
            events={events}
            onSelectMonth={(month) => {
              setAnchor(month);
              setSelectedDay(startOfDay(month));
              setView("month");
            }}
          />
        ) : null}

        {view === "day" || view === "week" ? (
          <View onLayout={measureGrid}>
            <TimeGrid
              days={days}
              events={events}
              onOpenEvent={openEvent}
              onCreateAt={createAt}
              onMorningOffset={measureMorning}
            />
          </View>
        ) : null}

        {/* Sous la grille et non à sa place : le mois déjà chargé reste
            affiché pendant qu'on en récupère un autre, plutôt que de laisser
            un écran vide à chaque navigation. */}
        {isPending ? <Text className="text-muted-foreground text-xs">Chargement…</Text> : null}
      </ScrollView>

      <EventFormDialog target={dialogTarget} onClose={() => setDialogTarget(null)} />
    </View>
  );
}

/** Jours couverts par la vue — la vue année n'en rend que ses deux bornes. */
function visibleDays(view: CalendarView, anchor: Date): Date[] {
  if (view === "day") return [startOfDay(anchor)];
  if (view === "week") return weekDays(anchor);
  if (view === "month") return monthGrid(anchor);
  return yearBounds(anchor);
}

function shiftAnchor(view: CalendarView, anchor: Date, direction: 1 | -1): Date {
  if (view === "day") return addDays(anchor, direction);
  if (view === "week") return addDays(anchor, 7 * direction);
  if (view === "month") return addMonths(anchor, direction);
  return addYears(anchor, direction);
}

function periodLabel(view: CalendarView, anchor: Date): string {
  if (view === "day") return dayLabel(anchor);
  if (view === "week") return weekLabel(anchor);
  if (view === "month") return monthLabel(anchor);
  return yearLabel(anchor);
}
