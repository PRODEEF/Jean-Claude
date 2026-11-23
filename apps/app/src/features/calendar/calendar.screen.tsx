import { useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, ListPlus, Plus } from "lucide-react-native";
import type { CalendarEntry, CalendarRange, TaskList, TaskListWithTasks } from "@jc/domain";
import {
  calendarDayOf,
  datedLists,
  projectOccurrences,
  dueForMoment,
  dueForSlot,
  momentOf,
  listsOfDay,
  listsWithoutVisibleEvent,
  earlierTodoStart,
  todoChunks,
  todoSpanDays,
  todoSpanFor,
  type TodoSpan,
} from "@jc/domain";
import { spacing } from "@jc/design";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useCalendarDefaultView } from "@/shared/hooks/use-profile";
import { useDetailPane } from "@/shared/providers/detail-pane";
import { useTaskActions, useTaskLists } from "@/shared/hooks/use-task-lists";
import { Button } from "@/shared/ui/button";
import { GRID_MAX_WIDTH, ScreenShell, contentColumn } from "@/shared/ui/screen-shell";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { Switch } from "@/shared/ui/switch";
import { Text } from "@/shared/ui/text";
import { CalendarToolbar, type CalendarView } from "./CalendarToolbar";
import { DueListsBoard } from "./DueListsBoard";
import { EventDetailDialog } from "./EventDetailDialog";
import { recentPointer } from "@/shared/lib/last-pointer";
import { EventFormDialog, type EventDialogTarget } from "./EventFormDialog";
import { TaskListDetailDialog } from "./TaskListDetailDialog";
import { TaskListDialog, type TaskListTarget } from "@/features/todo/TaskListDialog";
import { MonthGrid } from "./MonthGrid";
import { TimeGrid, type ListDropTarget } from "./TimeGrid";
import { YearGrid } from "./YearGrid";
import { useCalendarEvents, useListOccurrences } from "./hooks/use-calendar-events";
import {
  addDays,
  addMonths,
  addYears,
  dayLabel,
  isSameDay,
  monthGrid,
  monthLabel,
  startOfDay,
  startOfWeek,
  weekDays,
  yearBounds,
  yearLabel,
} from "@/shared/lib/dates";

/** Heure par défaut d'un événement créé sans viser de créneau. */
const DEFAULT_CREATE_MINUTE = 9 * 60;

/** Fenêtre à demander à l'API pour afficher `days`, bornes locales en UTC. */
/**
 * Ce que le volet ouvre pour une liste cliquée : la liste, et — quand elle se
 * répète — la date de la série sur laquelle on a cliqué, pour pouvoir agir sur
 * cette date seulement.
 */
function listPaneContent(list: TaskListWithTasks): {
  kind: "list";
  listId: string;
  occurrenceAt?: string;
} {
  return {
    kind: "list",
    listId: list.id,
    ...(list.occurrenceAt ? { occurrenceAt: list.occurrenceAt } : {}),
  };
}

function rangeOf(days: Date[]): CalendarRange {
  const first = days[0] ?? new Date();
  const last = days[days.length - 1] ?? first;
  return {
    from: startOfDay(first).toISOString(),
    to: addDays(startOfDay(last), 1).toISOString(),
  };
}

/**
 * Calendrier — vues jour, semaine, mois et année (§3, Phase B), plus Todo.
 *
 * Les quatre vues calendaires n'appellent pas quatre routes différentes :
 * elles demandent quatre fenêtres à la même. Changer de vue ou de période ne
 * fait donc que déplacer les bornes, et le mois déjà consulté revient du
 * cache. Todo s'y ajoute comme cinquième lecture, sans grille : les
 * todolistes du mois, et les rendez-vous rangés dans le moment de leur heure.
 *
 * Le bandeau de vue reste hors du défilement. Hors Todo, c'est l'intérieur de
 * la grille qui défile — les jours ou les heures — et non la page : le haut
 * du calendrier reste visible. Todo, lui, déroule ses listes dans la page.
 */
export function CalendarScreen() {
  const compact = useBreakpoint() === "compact";

  // `null` tant que l'utilisateur n'a pas touché au sélecteur : la vue suit
  // alors son réglage de compte, même si le profil arrive après le premier rendu.
  const defaultView = useCalendarDefaultView();
  const [chosenView, setView] = useState<CalendarView | null>(null);
  const view = chosenView ?? defaultView;
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  // Le gris d'un jour n'apparaît qu'après un clic dessus : `selectedDay` existe
  // dès l'arrivée (il alimente l'agenda du jour), mais ce n'est pas un choix.
  const [pickedDay, setPickedDay] = useState<Date | null>(null);
  const [dialogTarget, setDialogTarget] = useState<EventDialogTarget | null>(null);
  const [listTarget, setListTarget] = useState<TaskListTarget | null>(null);
  /** Détail d'un événement au clic, avant tout formulaire de modification (§4.2). */
  const [eventDetail, setEventDetail] = useState<CalendarEntry | null>(null);
  /** Détail d'une todoliste échue, au clic depuis l'agenda du jour. */
  const [listDetail, setListDetail] = useState<TaskListWithTasks | null>(null);
  const pane = useDetailPane();
  // Le volet de droite quand il existe, la fenêtre de détail sinon (téléphone).
  const showList = (list: TaskListWithTasks) =>
    pane.available ? pane.open(listPaneContent(list)) : setListDetail(list);
  // Ce que le volet montre appartient au calendrier : il se ferme avec lui.
  const closePane = pane.close;
  useEffect(() => closePane, [closePane]);
  const router = useRouter();
  const scroll = useRef<ScrollView>(null);

  // Vue Todo : une étendue de jours qui s'allonge vers le passé quand on défile,
  // et non plus le seul mois affiché (demande de Yann, 23 novembre).
  const [todoSpan, setTodoSpan] = useState<TodoSpan>(() => todoSpanFor(new Date(), new Date()));
  const todoDaysList = useMemo(() => todoSpanDays(todoSpan), [todoSpan]);
  const days = useMemo(
    () =>
      view === "todo"
        ? // Un mois de plus que l'affiché : le mois qui apparaîtra en remontant
          // est alors déjà chargé, sans saut de page à son arrivée.
          todoSpanDays({ ...todoSpan, from: earlierTodoStart(todoSpan.from) })
        : visibleDays(view, anchor),
    [view, anchor, todoSpan],
  );
  const range = useMemo(() => rangeOf(days), [days]);
  const { data, isPending, isError } = useCalendarEvents(range, view === "todo");
  const { data: storedLists } = useTaskLists();
  const { data: occurrences } = useListOccurrences(range, view === "todo");
  // Une liste qui se répète se lit à chacune de ses dates : tout ce qui suit lit
  // ces copies, pas la liste de base (fusion rendez-vous / todo, étape 5).
  const allLists = useMemo(
    () => (storedLists ? projectOccurrences(storedLists, occurrences) : storedLists),
    [storedLists, occurrences],
  );
  const { updateList, updateTask, setOccurrence } = useTaskActions();
  const [moveFailure, setMoveFailure] = useState<string | null>(null);
  // Une date d'une série lâchée sur un autre jour : on demande si elle seule bouge ou
  // toute la série (décision de Yann, 12 novembre).
  const [seriesMove, setSeriesMove] = useState<{
    listId: string;
    title: string;
    occurrenceAt: string;
    patch: { dueAt: string; dueAllDay: boolean };
  } | null>(null);
  // Rendus tels que le serveur les donne : le créneau d'une todoliste y est
  // désormais la projection de celle-ci (`slotForList`), et n'a plus à être
  // recomposé à l'affichage à partir de la liste qu'il représente.
  // Un rendez-vous converti en liste ne s'affiche qu'une fois : par sa liste. Tant
  // qu'il reste en base (la suppression est l'étape 6), l'original est masqué ici,
  // ce qui évite les doublons quel que soit l'ordre entre la conversion et le
  // déploiement.
  const events = useMemo(() => {
    const converted = new Set(
      (storedLists ?? []).flatMap((list) => (list.sourceEventId ? [list.sourceEventId] : [])),
    );
    return (data ?? []).filter((event) => !converted.has(event.id));
  }, [data, storedLists]);

  // Les todolistes échues se lisent dans le calendrier au même titre que les
  // rendez-vous : une journée chargée de todos est une journée chargée, et
  // devoir ouvrir un autre onglet pour s'en apercevoir ferait planifier à
  // l'aveugle.
  // Vues Jour/Semaine/Mois : une liste dont le rendez-vous est déjà dans la
  // fenêtre n'est pas redessinée (A.3). Si le lien existe mais que
  // l'événement n'est pas chargé, la liste reste visible — sinon elle
  // disparaissait des deux lectures.
  const dueLists = useMemo(
    () => listsWithoutVisibleEvent(allLists ?? [], new Set(events.map((event) => event.id))),
    [allLists, events],
  );
  // Vue Todo : les listes datées, toutes — une liste dont le créneau a été
  // posé n'est pas écartée ici, contrairement aux autres vues — plus les
  // rendez-vous qui ne sont pas ceux d'une liste.
  const allDatedLists = useMemo(() => datedLists(allLists ?? []), [allLists]);
  // Les rendez-vous que porte une todoliste s'affichent déjà avec elle.
  const standaloneEvents = useMemo(() => {
    const linked = new Set((allLists ?? []).map((list) => list.eventId));
    return events.filter((event) => !linked.has(event.id));
  }, [allLists, events]);

  /**
   * Affichés par défaut (demande de Yann) : chaque jour porte la trame
   * matin / après-midi / soir, et les journées vides aujourd'hui se rempliront
   * à l'usage — les masquer ferait d'un agenda un simple relevé.
   */
  const [hideEmptyDays, setHideEmptyDays] = useState(false);

  // Les jours de la vue Todo qui portent quelque chose, pour le masquage des
  // jours vides.
  const todoListDays = useMemo(
    () =>
      todoDaysList.filter(
        (day) =>
          listsOfDay(allDatedLists, day).length > 0 ||
          standaloneEvents.some((event) => isSameDay(new Date(event.startsAt), day)),
      ),
    [todoDaysList, allDatedLists, standaloneEvents],
  );
  const todoShownDays = hideEmptyDays ? todoListDays : todoDaysList;
  const todoChunkList = useMemo(
    () => todoChunks(todoShownDays, todoSpan.focus),
    [todoShownDays, todoSpan.focus],
  );

  // ── Défilement de la vue Todo ──
  // `pendingFocus` : le bloc de départ n'est pas encore posé en haut ; dès qu'il
  // est mesuré, on y défile. `chunkNodes` : les blocs affichés, mesurés à la
  // demande pour savoir quel mois on survole (leur position change à chaque mois
  // ajouté au-dessus, aucune valeur retenue ne resterait juste). `prependFrom` :
  // hauteur avant l'ajout d'un mois au-dessus, pour que la page ne saute pas.
  const pendingFocus = useRef<number | null>(null);
  const chunkNodes = useRef(new Map<number, { node: View; first: Date }>());
  const measuring = useRef(false);
  const scrollY = useRef(0);
  const contentHeight = useRef(0);
  const prependFrom = useRef<number | null>(null);

  const resetTodo = (month: Date) => {
    const next = todoSpanFor(month, new Date());
    pendingFocus.current = next.focus.getTime();
    setTodoSpan(next);
  };

  const onChunkLayout = (first: Date, event: LayoutChangeEvent) => {
    if (pendingFocus.current === first.getTime()) {
      pendingFocus.current = null;
      scroll.current?.scrollTo({ y: event.nativeEvent.layout.y, animated: false });
    }
  };

  // Le mois du bandeau suit ce qui est en haut de l'écran.
  const syncMonthWithScroll = (y: number) => {
    const inner = scroll.current?.getInnerViewNode();
    if (!inner || measuring.current) return;
    const entries = [...chunkNodes.current.values()];
    let pending = entries.length;
    if (pending === 0) return;
    measuring.current = true;
    let current: Date | null = null;
    let currentTop = -Infinity;
    const done = () => {
      pending -= 1;
      if (pending > 0) return;
      measuring.current = false;
      if (
        current &&
        (current.getMonth() !== anchor.getMonth() || current.getFullYear() !== anchor.getFullYear())
      ) {
        setAnchor(new Date(current.getFullYear(), current.getMonth(), 1));
      }
    };
    for (const { node, first } of entries) {
      node.measureLayout(
        inner,
        (_left, top) => {
          if (top <= y + 80 && top > currentTop) {
            current = first;
            currentTop = top;
          }
          done();
        },
        done,
      );
    }
  };

  const onTodoScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    scrollY.current = y;
    syncMonthWithScroll(y);

    // Près du haut : un mois de plus vers le passé.
    if (y < 600 && prependFrom.current === null && pendingFocus.current === null) {
      prependFrom.current = contentHeight.current;
      // Sans rien d'ajouté (jours vides masqués), la hauteur ne bouge pas : on
      // libère le verrou quand même, pour que le mois suivant puisse venir.
      setTimeout(() => {
        prependFrom.current = null;
      }, 800);
      setTodoSpan((span) => ({ ...span, from: earlierTodoStart(span.from) }));
    }
  };

  const onTodoContentSize = (_width: number, height: number) => {
    // Le mois ajouté au-dessus pousse tout vers le bas : on rattrape de la
    // même hauteur pour que ce qu'on lisait reste sous les yeux.
    if (prependFrom.current !== null) {
      const added = height - prependFrom.current;
      prependFrom.current = null;
      if (added > 0) scroll.current?.scrollTo({ y: scrollY.current + added, animated: false });
    }
    contentHeight.current = height;
  };

  // La sélection suit la période affichée : sans cela, la liste du jour
  // resterait sur septembre alors que la grille montre octobre — le contresens
  // est immédiat sur téléphone, où c'est elle qui porte le détail.
  const shift = (direction: 1 | -1) => {
    const next = shiftAnchor(view, anchor, direction);
    setAnchor(next);
    if (view === "todo") resetTodo(next);
    setPickedDay(null);
    if (view === "week") setSelectedDay(startOfWeek(next));
    else if (view !== "year") setSelectedDay(startOfDay(next));
  };

  const goToToday = () => {
    const today = new Date();
    setAnchor(today);
    if (view === "todo") resetTodo(today);
    setSelectedDay(startOfDay(today));
    setPickedDay(null);
  };

  // Entrer dans la vue Todo repart du mois affiché : jour de départ posé en haut.
  const changeView = (next: CalendarView) => {
    if (next === "todo" && view !== "todo") resetTodo(anchor);
    setView(next);
  };

  // Minuit, et non l'heure courante : une liste datée sur un jour n'a pas
  // d'horaire tant que l'utilisateur n'en pose pas un (§13.4.1).
  const dueDay = () => startOfDay(selectedDay).toISOString();

  // Le clic ouvre d'abord un détail, à la façon de Google Calendar (§4.2) — pas
  // directement le formulaire de modification. `editEvent` est le pas de plus,
  // déclenché depuis ce détail.
  //
  // Une todoliste datée avec horaire porte un événement (`list.eventId`) : la
  // grille l'affiche comme n'importe quel rendez-vous, mais le clic doit rouvrir
  // le détail de la liste — cochable — et non un détail de rendez-vous générique
  // qui ne montrerait rien de ce qu'il y a à faire.
  const openEvent = (event: CalendarEntry) => {
    const linkedList = allLists?.find((list) => list.eventId === event.id);
    if (linkedList) {
      showList(linkedList);
      return;
    }
    setEventDetail(event);
  };
  const editEvent = (event: CalendarEntry) => {
    setEventDetail(null);
    setDialogTarget({ mode: "edit", event });
  };
  // Depuis une case de la grille, la fenêtre s'ouvre à côté du clic et ne le
  // recouvre pas ; le bouton « Événement » de la barre n'a pas de case à éviter.
  const createAt = (day: Date, minute = DEFAULT_CREATE_MINUTE) => {
    const anchor = recentPointer();
    setDialogTarget({ mode: "create", day, minute, ...(anchor ? { anchor } : {}) });
  };
  // Un jour cliqué en vue mois propose directement d'y poser un événement : la
  // sélection continue par ailleurs d'alimenter l'agenda du jour, en dessous.
  const selectDay = (day: Date) => {
    setSelectedDay(day);
    setPickedDay(day);
    createAt(day, DEFAULT_CREATE_MINUTE);
  };
  // Liste déposée sur un jour de la grille horaire : à l'heure lâchée, ou sans
  // heure depuis le bandeau. Un dépôt qui ne change rien n'appelle pas le serveur.
  const moveList = (listId: string, day: Date, target: ListDropTarget) => {
    const saved = allLists?.find((candidate) => candidate.id === listId);
    if (!saved) return;
    const patch =
      target.kind === "slot" ? dueForSlot(day, target.minute) : dueForMoment(day, "anytime", saved);
    if (patch.dueAt === saved.dueAt && patch.dueAllDay === saved.dueAllDay) return;

    setMoveFailure(null);
    updateList.mutate(
      { id: listId, patch },
      { onError: () => setMoveFailure("Le déplacement a échoué. Réessayez dans un instant.") },
    );
  };

  const MOVE_FAILED = "Le déplacement a échoué. Réessayez dans un instant.";

  // Une liste figure à un jour par sa propre échéance, ou — sans elle — par
  // les tâches qu'on y a datées (`datedLists`). Dans le second cas, ce n'est
  // pas l'échéance de la liste qu'on déplace mais la date de ces tâches : sans
  // quoi la liste revenait à sa place, la projection restant sur l'ancien jour.
  const hasOwnDay = (list: TaskListWithTasks, day: string) =>
    list.dueAt !== null && calendarDayOf(new Date(list.dueAt)) === day;

  // Liste lâchée sur un jour de la vue mois : elle garde son heure (ou son
  // absence d'heure), seul le jour change, comme dans un agenda.
  const moveListToDay = (listId: string, day: Date, fromDay: string) => {
    const saved = allLists?.find((candidate) => candidate.id === listId);
    if (!saved) return;
    setMoveFailure(null);

    // La date prise, parmi les copies d'une série : c'est elle qui garde son heure, et
    // non la première date de la série, que `saved` désigne.
    const taken =
      saved.rrule !== null
        ? allLists?.find(
            (candidate) =>
              candidate.id === listId && candidate.occurrenceAt && hasOwnDay(candidate, fromDay),
          )
        : undefined;
    const from = taken ?? saved;

    if (!hasOwnDay(from, fromDay)) {
      const toDay = calendarDayOf(day);
      if (toDay === fromDay) return;
      for (const task of saved.tasks.filter((candidate) => candidate.dueOn === fromDay)) {
        updateTask.mutate(
          { listId, taskId: task.id, patch: { dueOn: toDay } },
          { onError: () => setMoveFailure(MOVE_FAILED) },
        );
      }
      return;
    }

    const patch = dueForMoment(day, momentOf(from), from);
    if (patch.dueAt === from.dueAt && patch.dueAllDay === from.dueAllDay) return;

    if (taken?.occurrenceAt) {
      setSeriesMove({ listId, title: saved.title, occurrenceAt: taken.occurrenceAt, patch });
      return;
    }
    updateList.mutate({ id: listId, patch }, { onError: () => setMoveFailure(MOVE_FAILED) });
  };

  // Même règle que dans le volet : échanger les heures plutôt que deviner un rang.
  const swapListHours = (draggedId: string, targetId: string, day: string) => {
    const dragged = allLists?.find((candidate) => candidate.id === draggedId);
    const target = allLists?.find((candidate) => candidate.id === targetId);
    if (!dragged || !target) return;
    setMoveFailure(null);

    // Une liste présente par ses tâches seules n'a pas d'heure à échanger.
    const draggedDue = dragged.dueAt;
    const targetDue = target.dueAt;
    if (!draggedDue || !targetDue || !hasOwnDay(dragged, day) || !hasOwnDay(target, day)) {
      setMoveFailure(
        "Cette liste n'a pas d'heure à elle ce jour-là. Ouvrez-la pour lui en donner une.",
      );
      return;
    }
    if (draggedDue === targetDue && dragged.dueAllDay === target.dueAllDay) return;

    const onError = () => setMoveFailure(MOVE_FAILED);
    updateList.mutate(
      { id: dragged.id, patch: { dueAt: targetDue, dueAllDay: target.dueAllDay ?? true } },
      { onError },
    );
    updateList.mutate(
      { id: target.id, patch: { dueAt: draggedDue, dueAllDay: dragged.dueAllDay ?? true } },
      { onError },
    );
  };

  // Une entrée du calendrier peut n'être que la projection des tâches d'un
  // jour (`datedLists`) : c'est la vraie liste qu'on modifie, sans quoi le
  // formulaire lui prêterait pour échéance le jour de ces tâches.
  const editList = (list: TaskList) => {
    setListDetail(null);
    setListTarget({
      mode: "edit",
      list: allLists?.find((candidate) => candidate.id === list.id) ?? list,
    });
  };

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
            onPress={() =>
              setListTarget({ mode: "create", folderId: null, dueAt: dueDay(), dueAllDay: true })
            }
            accessibilityRole="button"
            accessibilityLabel="Nouvelle liste de tâches"
          >
            <Icon as={ListPlus} className="size-4" />
            <Text>Tâches</Text>
          </Button>
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
      }
      maxWidth={GRID_MAX_WIDTH}
      scrolls={false}
    >
      <View className="min-h-0 flex-1">
        <View className="bg-background">
          <View style={[contentColumn(compact, GRID_MAX_WIDTH), { paddingVertical: spacing.md }]}>
            <CalendarToolbar
              label={periodLabel(view, anchor)}
              view={view}
              onViewChange={changeView}
              onPrevious={() => shift(-1)}
              onNext={() => shift(1)}
              onToday={goToToday}
            />
          </View>
        </View>

        {view === "todo" ? (
          <ScrollView
            ref={scroll}
            style={{ flex: 1 }}
            scrollEventThrottle={50}
            onScroll={onTodoScroll}
            onContentSizeChange={onTodoContentSize}
            contentContainerStyle={[
              contentColumn(compact, GRID_MAX_WIDTH),
              { paddingVertical: spacing.lg, gap: spacing.lg },
            ]}
          >
            <View className="flex-row items-center justify-end gap-2">
              <Text className="text-muted-foreground text-xs">Jours sans liste</Text>
              <Switch
                value={!hideEmptyDays}
                onValueChange={(value) => setHideEmptyDays(!value)}
                accessibilityLabel="Afficher les jours sans liste"
              />
            </View>

            {hideEmptyDays && todoShownDays.length === 0 ? (
              <Text className="text-muted-foreground text-sm">
                Rien de prévu sur cette période.
              </Text>
            ) : (
              // Un bloc par mois (et un pour le jour de départ) : le mois en haut
              // de l'écran donne le libellé du bandeau, et on remonte le temps en
              // défilant. Chaque bloc commence à son premier jour : son titre dit le mois.
              todoChunkList.map((chunk) => {
                const first = chunk[0];
                if (!first) return null;
                return (
                  <View
                    key={first.getTime()}
                    className="gap-3"
                    ref={(node) => {
                      if (node) chunkNodes.current.set(first.getTime(), { node, first });
                      else chunkNodes.current.delete(first.getTime());
                    }}
                    onLayout={(event) => onChunkLayout(first, event)}
                  >
                    {first.getDate() === 1 ? (
                      <Text className="text-muted-foreground text-xs font-semibold uppercase">
                        {monthLabel(first)}
                      </Text>
                    ) : null}
                    <DueListsBoard
                      days={chunk}
                      lists={allDatedLists}
                      events={standaloneEvents}
                      onOpenEvent={openEvent}
                    />
                  </View>
                );
              })
            )}

            {/* Au bout, le mois suivant s'ajoute à la suite : on ne remonte pas
              jusqu'aux flèches pour aller plus loin. */}
            <View className="flex-row items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onPress={() =>
                  setTodoSpan((span) => ({
                    ...span,
                    toMonth: addMonths(span.toMonth, 1),
                  }))
                }
                accessibilityRole="button"
                accessibilityLabel={`Afficher ${monthLabel(addMonths(todoSpan.toMonth, 1))}`}
              >
                <Text>{monthLabel(addMonths(todoSpan.toMonth, 1))}</Text>
                <Icon as={ChevronRight} className="size-4" />
              </Button>
            </View>
          </ScrollView>
        ) : (
          <View
            className="min-h-0 flex-1 gap-3"
            style={[contentColumn(compact, GRID_MAX_WIDTH), { paddingVertical: spacing.md }]}
          >
            {isError ? (
              <Text className="text-destructive text-sm">
                Le calendrier n'a pas pu être chargé. Réessayez dans un instant.
              </Text>
            ) : null}

            {view === "month" ? (
              <MonthGrid
                days={days}
                anchor={anchor}
                events={events}
                lists={dueLists}
                selectedDay={pickedDay}
                onSelectDay={selectDay}
                onOpenEvent={openEvent}
                {...(pane.available
                  ? { onOpenList: (list) => pane.open(listPaneContent(list)) }
                  : {})}
                onMoveList={moveListToDay}
                onSwapLists={swapListHours}
                compact={compact}
              />
            ) : null}

            {view === "year" ? (
              <ScrollView style={{ flex: 1 }}>
                <YearGrid
                  anchor={anchor}
                  events={events}
                  onSelectMonth={(month) => {
                    setAnchor(month);
                    setSelectedDay(startOfDay(month));
                    setPickedDay(null);
                    setView("month");
                  }}
                />
              </ScrollView>
            ) : null}

            {view === "day" || view === "week" ? (
              <TimeGrid
                days={days}
                events={events}
                lists={dueLists}
                onOpenEvent={openEvent}
                onOpenList={showList}
                onCreateAt={createAt}
                onMoveList={moveList}
              />
            ) : null}

            {moveFailure ? <Text className="text-destructive text-xs">{moveFailure}</Text> : null}
            {isPending ? <Text className="text-muted-foreground text-xs">Chargement…</Text> : null}
          </View>
        )}
      </View>

      <EventFormDialog target={dialogTarget} onClose={() => setDialogTarget(null)} />
      <EventDetailDialog
        event={eventDetail}
        onClose={() => setEventDetail(null)}
        onEdit={editEvent}
      />

      {/* La liste créée s'ouvre dans son onglet : c'est là qu'on la remplit,
          ligne par ligne, plutôt que dans une seconde saisie qui aurait à
          reproduire le même éditeur. */}
      <TaskListDialog
        target={listTarget}
        onClose={() => setListTarget(null)}
        onCreated={(created) => router.push(`/todo?list=${created.id}` as never)}
      />
      <TaskListDetailDialog
        list={listDetail}
        onClose={() => setListDetail(null)}
        onEdit={editList}
      />
      {seriesMove ? (
        <Modal
          open
          onClose={() => setSeriesMove(null)}
          variant="confirm"
          title={`Déplacer « ${seriesMove.title} » ?`}
          description="Ce rendez-vous se répète. Déplacer seulement cette date, ou toute la série ?"
          actions={[
            { label: "Annuler", onPress: () => setSeriesMove(null) },
            {
              label: "Cette date seulement",
              onPress: () => {
                const move = seriesMove;
                setSeriesMove(null);
                setMoveFailure(null);
                setOccurrence.mutate(
                  {
                    id: move.listId,
                    input: { occurrenceAt: move.occurrenceAt, movedTo: move.patch.dueAt },
                  },
                  { onError: () => setMoveFailure(MOVE_FAILED) },
                );
              },
            },
            {
              label: "Toute la série",
              variant: "default",
              onPress: () => {
                const move = seriesMove;
                setSeriesMove(null);
                setMoveFailure(null);
                updateList.mutate(
                  { id: move.listId, patch: move.patch },
                  { onError: () => setMoveFailure(MOVE_FAILED) },
                );
              },
            },
          ]}
        />
      ) : null}
    </ScreenShell>
  );
}

/** Jours couverts par la vue — la vue année n'en rend que ses deux bornes. */
function visibleDays(view: CalendarView, anchor: Date): Date[] {
  if (view === "day") return [startOfDay(anchor)];
  if (view === "week") return weekDays(anchor);
  if (view === "month" || view === "todo") return monthGrid(anchor);
  return yearBounds(anchor);
}

function shiftAnchor(view: CalendarView, anchor: Date, direction: 1 | -1): Date {
  if (view === "day") return addDays(anchor, direction);
  if (view === "week") return addDays(anchor, 7 * direction);
  if (view === "month" || view === "todo") return addMonths(anchor, direction);
  return addYears(anchor, direction);
}

/**
 * Période affichée dans le bandeau — seul texte de date, depuis la fusion
 * avec l'ancien texte de navigation (§4.2, disposition Google Agenda).
 *
 * En vue Semaine, le mois seul : une plage complète (« Semaine du 7 au 13
 * septembre ») ne tient pas à côté des autres commandes du bandeau, et le
 * mois suffit à la situer.
 */
function periodLabel(view: CalendarView, anchor: Date): string {
  if (view === "day") return dayLabel(anchor);
  if (view === "week" || view === "month" || view === "todo") return monthLabel(anchor);
  return yearLabel(anchor);
}
