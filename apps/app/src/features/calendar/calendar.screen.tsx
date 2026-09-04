import { useMemo, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { ListPlus, Plus } from "lucide-react-native";
import type { CalendarEvent } from "@jc/domain";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useTaskLists } from "@/shared/hooks/use-task-lists";
import { listsOfDay, unscheduledLists } from "@/shared/lib/tasks";
import { Button } from "@/shared/ui/button";
import { GRID_MAX_WIDTH, ScreenShell } from "@/shared/ui/screen-shell";
import { Icon } from "@/shared/ui/icon";
import { Switch } from "@/shared/ui/switch";
import { Text } from "@/shared/ui/text";
import { CalendarToolbar, type CalendarView } from "./CalendarToolbar";
import { DayAgenda } from "./DayAgenda";
import { DueListsBoard } from "./DueListsBoard";
import { EventFormDialog, type EventDialogTarget } from "./EventFormDialog";
import { TaskListDialog, type TaskListTarget } from "@/features/todo/TaskListDialog";
import { MonthGrid } from "./MonthGrid";
import { TimeGrid } from "./TimeGrid";
import { YearGrid } from "./YearGrid";
import { useCalendarEvents } from "./hooks/use-calendar-events";
import { rangeOf } from "./lib/calendar-dates";
import {
  addDays,
  addMonths,
  addYears,
  dayLabel,
  monthGrid,
  monthLabel,
  startOfDay,
  startOfWeek,
  weekDays,
  weekLabel,
  yearBounds,
  yearLabel,
} from "@/shared/lib/dates";

/** Heure par défaut d'un événement créé sans viser de créneau. */
const DEFAULT_CREATE_MINUTE = 9 * 60;

/**
 * Calendrier — vues jour, semaine, mois et année (§3, Phase B).
 *
 * Les quatre vues n'appellent pas quatre routes différentes : elles demandent
 * quatre fenêtres à la même. Changer de vue ou de période ne fait donc que
 * déplacer les bornes, et le mois déjà consulté revient du cache.
 *
 * Une seule zone défilante, celle du contenu posé par `ScreenShell` : les
 * grilles se déroulent en entier dedans. Une grille qui défilerait pour son
 * compte emporterait sa barre de défilement dans la largeur de ses colonnes,
 * décalant celles-ci de leurs en-têtes.
 */
export function CalendarScreen() {
  const compact = useBreakpoint() === "compact";

  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [dialogTarget, setDialogTarget] = useState<EventDialogTarget | null>(null);
  const [listTarget, setListTarget] = useState<TaskListTarget | null>(null);
  const router = useRouter();

  const days = useMemo(() => visibleDays(view, anchor), [view, anchor]);
  const range = useMemo(() => rangeOf(days), [days]);
  const { data, isPending, isError } = useCalendarEvents(range);
  const events = data ?? [];

  // Les todolistes échues se lisent dans le calendrier au même titre que les
  // rendez-vous : une journée chargée de todos est une journée chargée, et
  // devoir ouvrir un autre onglet pour s'en apercevoir ferait planifier à
  // l'aveugle. Elles restent en lecture seule ici — on les coche dans
  // l'onglet Mes listes, qui est leur écran.
  const { data: lists } = useTaskLists();
  const dueLists = useMemo(() => unscheduledLists(lists ?? []), [lists]);

  /** Masque par défaut : sur un mois entier, tout afficher noierait les jours qui comptent. */
  const [hideEmptyDays, setHideEmptyDays] = useState(true);

  // Les jours réels du mois affiché, sans le débord des mois voisins que
  // porte la grille : une todoliste du 31 août n'a pas sa place dans « le
  // mois de septembre ».
  const monthDays = useMemo(
    () => days.filter((day) => day.getMonth() === anchor.getMonth()),
    [days, anchor],
  );
  const monthListDays = useMemo(
    () => monthDays.filter((day) => listsOfDay(dueLists, day).length > 0),
    [monthDays, dueLists],
  );

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

  // Minuit, et non l'heure courante : une liste datée sur un jour n'a pas
  // d'horaire tant que l'utilisateur n'en pose pas un (§13.4.1).
  const dueDay = () => startOfDay(selectedDay).toISOString();

  const openEvent = (event: CalendarEvent) => setDialogTarget({ mode: "edit", event });
  const createAt = (day: Date, minute: number) => setDialogTarget({ mode: "create", day, minute });

  return (
    <ScreenShell
      title="Calendrier"
      action={
        // Deux créations et non une : ce qu'on pose sur une journée est soit un
        // rendez-vous, soit ce qu'on doit y boucler. Le second bouton évite le
        // détour par l'onglet Mes listes pour dater une liste sur le jour qu'on
        // a justement sous les yeux.
        <View className="flex-row items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onPress={() => setListTarget({ mode: "create", folderId: null, dueAt: dueDay() })}
            accessibilityRole="button"
            accessibilityLabel="Nouvelle liste de tâches"
          >
            <Icon as={ListPlus} className="size-4" />
            <Text>Tâches</Text>
          </Button>
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
      }
      maxWidth={GRID_MAX_WIDTH}
    >
      <CalendarToolbar
        label={periodLabel(view, anchor)}
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
        <>
          <MonthGrid
            days={days}
            anchor={anchor}
            events={events}
            lists={dueLists}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            onOpenEvent={openEvent}
            compact={compact}
          />
          <DayAgenda day={selectedDay} events={events} lists={dueLists} onOpenEvent={openEvent} />

          {/* Bloc distinct de l'agenda du jour : celui-ci reste sur le jour
              sélectionné, celui-ci couvre le mois entier — c'est la lecture par
              semaine de l'ancien onglet Todoliste, reprise ici plutôt que
              dupliquée dans Mes listes. */}
          <View className="gap-2">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="text-base font-medium">Todolistes du mois</Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-muted-foreground text-xs">Jours sans liste</Text>
                <Switch
                  value={!hideEmptyDays}
                  onValueChange={(value) => setHideEmptyDays(!value)}
                  accessibilityLabel="Afficher les jours sans liste"
                />
              </View>
            </View>

            {hideEmptyDays && monthListDays.length === 0 ? (
              <Text className="text-muted-foreground text-sm">Aucune todoliste ce mois-ci.</Text>
            ) : (
              <DueListsBoard days={hideEmptyDays ? monthListDays : monthDays} lists={dueLists} />
            )}
          </View>
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
        <TimeGrid
          days={days}
          events={events}
          lists={dueLists}
          onOpenEvent={openEvent}
          onCreateAt={createAt}
        />
      ) : null}

      {/* Sous la grille et non à sa place : le mois déjà chargé reste
          affiché pendant qu'on en récupère un autre, plutôt que de laisser
          un écran vide à chaque navigation. */}
      {isPending ? <Text className="text-muted-foreground text-xs">Chargement…</Text> : null}

      <EventFormDialog target={dialogTarget} onClose={() => setDialogTarget(null)} />

      {/* La liste créée s'ouvre dans son onglet : c'est là qu'on la remplit,
          ligne par ligne, plutôt que dans une seconde saisie qui aurait à
          reproduire le même éditeur. */}
      <TaskListDialog
        target={listTarget}
        onClose={() => setListTarget(null)}
        onCreated={(created) => router.push(`/todo?list=${created.id}` as never)}
      />
    </ScreenShell>
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
