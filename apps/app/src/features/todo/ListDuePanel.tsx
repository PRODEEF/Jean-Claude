import { useState } from "react";
import { View } from "react-native";
import { dayPartDefaultTime, dayPartOfHour, type DayPart, type TaskList } from "@jc/domain";
import { AnchoredPanel } from "@/shared/ui/anchored-panel";
import { DateTimeField } from "@/shared/ui/date-time-field";
import { SegmentedControl, type SegmentedOption } from "@/shared/ui/segmented-control";
import { Text } from "@/shared/ui/text";
import { useTaskActions } from "@/shared/hooks/use-task-lists";
import { useDayPartBounds } from "@/shared/hooks/use-profile";
import { formatDateInput, parseTimeInput } from "@/shared/lib/date-input";
import { parseDue, timeOf, toMessage } from "./TaskListDialog";

type Moment = "day" | DayPart;

const MOMENTS: SegmentedOption<Moment>[] = [
  { value: "day", label: "Journée" },
  { value: "morning", label: "Matin" },
  { value: "afternoon", label: "Après-midi" },
  { value: "evening", label: "Soir" },
];

/**
 * Date et heure d'une liste, réglées dans un panneau posé sous le doigt plutôt
 * que dans une fenêtre (demande de Yann, 23 novembre) : chaque choix s'enregistre
 * aussitôt, il n'y a ni titre ni bouton « Enregistrer ».
 *
 * Mêmes règles que `DueDialog` (`parseDue`) : un choix invalide n'est pas
 * enregistré, il est dit dans le panneau.
 */
export function ListDuePanel({
  list,
  x,
  y,
  onClose,
}: {
  list: TaskList;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const { updateList } = useTaskActions();
  const bounds = useDayPartBounds();
  const [date, setDate] = useState(() =>
    list.dueAt === null ? "" : formatDateInput(new Date(list.dueAt)),
  );
  const [time, setTime] = useState(() => timeOf(list.dueAt, list.dueAllDay));
  const [error, setError] = useState<string | null>(null);

  const typed = parseTimeInput(time);
  const moment: Moment = typed ? dayPartOfHour(typed.hours, bounds) : "day";

  const save = (nextDate: string, nextTime: string) => {
    const due = parseDue(nextDate, nextTime, list.dueAt);
    if (!due.ok) {
      setError(due.message);
      return;
    }
    setError(null);
    // Rien à écrire si rien n'a changé : le champ de date renvoie sa valeur au
    // moindre geste.
    if (due.value === list.dueAt && (due.allDay ?? list.dueAllDay) === list.dueAllDay) return;

    updateList.mutate(
      {
        id: list.id,
        patch: { dueAt: due.value, ...(due.allDay === null ? {} : { dueAllDay: due.allDay }) },
      },
      { onError: (cause) => setError(toMessage(cause)) },
    );
  };

  const changeDate = (next: string) => {
    setDate(next);
    save(next, time);
  };
  const changeTime = (next: string) => {
    setTime(next);
    save(date, next);
  };
  const chooseMoment = (next: Moment) => {
    if (next === "day") {
      changeTime("");
      return;
    }
    // « 10h » reste « 10h » quand on touche « Matin ».
    if (moment === next) return;
    const nextTime = dayPartDefaultTime(next, bounds);
    // Une heure sans date n'est pas une échéance : on propose aujourd'hui.
    const nextDate = date.trim().length === 0 ? formatDateInput(new Date()) : date;
    setDate(nextDate);
    setTime(nextTime);
    save(nextDate, nextTime);
  };

  return (
    <AnchoredPanel x={x} y={y} width={340} height={260} onClose={onClose}>
      <View className="gap-1">
        <Text className="text-muted-foreground text-xs">Date</Text>
        <DateTimeField
          mode="date"
          value={date}
          onChange={changeDate}
          placeholder="Aucune"
          clearable
          accessibilityLabel={`Date de ${list.title}`}
        />
      </View>
      <View className="gap-1">
        <Text className="text-muted-foreground text-xs">Moment</Text>
        <SegmentedControl options={MOMENTS} value={moment} onChange={chooseMoment} />
      </View>
      <View className="gap-1">
        <Text className="text-muted-foreground text-xs">Heure précise</Text>
        <DateTimeField
          mode="time"
          value={time}
          onChange={changeTime}
          placeholder="Aucune"
          clearable
          accessibilityLabel={`Heure de ${list.title}`}
        />
      </View>
      {error ? <Text className="text-destructive text-xs">{error}</Text> : null}
    </AnchoredPanel>
  );
}
