import { useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import type { CalendarEntry, CalendarRange } from "@jc/domain";
import { addDays, datedLists, projectOccurrences, startOfDay } from "@jc/domain";
import { useTaskLists } from "@/shared/hooks/use-task-lists";
import { DueListsBoard } from "@/features/calendar/DueListsBoard";
import { EventDetailDialog } from "@/features/calendar/EventDetailDialog";
import { EventFormDialog, type EventDialogTarget } from "@/features/calendar/EventFormDialog";
import {
  useCalendarEvents,
  useListOccurrences,
} from "@/features/calendar/hooks/use-calendar-events";

/** Une semaine à partir du jour visé : de quoi situer la tâche sans noyer le volet. */
const PANE_TODO_DAYS = 7;

/**
 * La vue « Calendrier – Todo » dans le volet de droite : les jours à partir de
 * `from`, avec leurs moments (matin, après-midi, soir) et les listes qu'on
 * retrouve ensuite dans l'onglet Todo du calendrier (Yann, 26 novembre : cliquer
 * une tâche du calendrier, ou voir une proposition, ouvre cette vue plutôt que
 * « Mes listes »).
 *
 * `above` : ce qui se pose au-dessus des jours — la carte d'une proposition à
 * valider.
 */
export function TodoPaneBody({ from, above }: { from: Date; above?: ReactNode }) {
  const firstDay = startOfDay(from).getTime();
  const days = useMemo(
    () => Array.from({ length: PANE_TODO_DAYS }, (_, index) => addDays(new Date(firstDay), index)),
    [firstDay],
  );
  const range: CalendarRange = useMemo(
    () => ({
      from: new Date(firstDay).toISOString(),
      to: addDays(new Date(firstDay), PANE_TODO_DAYS).toISOString(),
    }),
    [firstDay],
  );

  const { data: storedLists } = useTaskLists();
  const { data: occurrences } = useListOccurrences(range, true);
  const { data: fetched } = useCalendarEvents(range, true);

  // Même composition que l'onglet Todo du calendrier : les séries sont dépliées à
  // chacune de leurs dates, et un rendez-vous que porte une liste s'affiche avec elle.
  const lists = useMemo(
    () => datedLists(storedLists ? projectOccurrences(storedLists, occurrences) : []),
    [storedLists, occurrences],
  );
  const events = useMemo(() => {
    const linked = new Set(
      (storedLists ?? []).flatMap((list) => [list.eventId, list.sourceEventId]),
    );
    return (fetched ?? []).filter((event) => !linked.has(event.id));
  }, [fetched, storedLists]);

  const [detail, setDetail] = useState<CalendarEntry | null>(null);
  const [editing, setEditing] = useState<EventDialogTarget | null>(null);

  return (
    <View className="gap-6">
      {above}
      <DueListsBoard days={days} lists={lists} events={events} onOpenEvent={setDetail} />
      <EventDetailDialog
        event={detail}
        onClose={() => setDetail(null)}
        onEdit={(event) => {
          setDetail(null);
          setEditing({ mode: "edit", event });
        }}
      />
      <EventFormDialog target={editing} onClose={() => setEditing(null)} />
    </View>
  );
}
