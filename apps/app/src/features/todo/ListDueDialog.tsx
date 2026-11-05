import { useState } from "react";
import { View } from "react-native";
import {
  DAY_PART_DEFAULT_TIME,
  dayPartOfHour,
  type DayPart,
  type TaskList,
  type UpdateTaskList,
} from "@jc/domain";
import { DateTimeField } from "@/shared/ui/date-time-field";
import { Modal } from "@/shared/ui/modal";
import { SegmentedControl, type SegmentedOption } from "@/shared/ui/segmented-control";
import { Text } from "@/shared/ui/text";
import { useTaskActions } from "@/shared/hooks/use-task-lists";
import { formatDateInput, parseTimeInput } from "@/shared/lib/date-input";
import { parseDue, timeOf, toMessage } from "./TaskListDialog";

/** « Journée » : une échéance sans heure, qui n'impose aucun horaire (voir `parseDue`). */
type Moment = "day" | DayPart;

const MOMENTS: SegmentedOption<Moment>[] = [
  { value: "day", label: "Journée" },
  { value: "morning", label: "Matin" },
  { value: "afternoon", label: "Après-midi" },
  { value: "evening", label: "Soir" },
];

/**
 * Changer l'échéance d'une liste depuis son en-tête, sans passer par
 * « Modifier la liste ».
 *
 * Le jour, le mois et l'année se règlent dans le champ de date, segment par
 * segment. Le moment de la journée n'est qu'un raccourci pour l'heure : il la
 * pose, et se relit d'après elle (`dayPartOfHour`).
 */
export function ListDueDialog({ list, onClose }: { list: TaskList; onClose: () => void }) {
  const { updateList } = useTaskActions();
  /** `JJ/MM/AAAA`, vide quand la liste n'a pas d'échéance. */
  const [date, setDate] = useState(() =>
    list.dueAt === null ? "" : formatDateInput(new Date(list.dueAt)),
  );
  /** `HH:MM`, vide quand l'échéance ne vise pas d'heure précise. */
  const [time, setTime] = useState(() => timeOf(list.dueAt, list.dueAllDay));
  const [error, setError] = useState<string | null>(null);

  const typed = parseTimeInput(time);
  const moment: Moment = typed ? dayPartOfHour(typed.hours) : "day";

  const chooseMoment = (next: Moment) => {
    if (next === "day") {
      setTime("");
      return;
    }
    // Une heure déjà dans ce moment reste telle quelle : « 10h » n'a pas à
    // devenir « 9h » parce qu'on touche « Matin ».
    if (moment === next) return;

    setTime(DAY_PART_DEFAULT_TIME[next]);
    // Une heure sans date n'est pas une échéance : on propose aujourd'hui.
    if (date.trim().length === 0) setDate(formatDateInput(new Date()));
  };

  const save = () => {
    const due = parseDue(date, time, list.dueAt);
    if (!due.ok) {
      setError(due.message);
      return;
    }
    setError(null);

    // Sans date, il n'y a pas de moment : le serveur efface les deux ensemble.
    const patch: UpdateTaskList = {
      dueAt: due.value,
      ...(due.allDay === null ? {} : { dueAllDay: due.allDay }),
    };
    updateList.mutate(
      { id: list.id, patch },
      { onSuccess: onClose, onError: (cause) => setError(toMessage(cause)) },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Échéance"
      description={list.title}
      error={error}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: updateList.isPending },
        { label: "Enregistrer", variant: "default", onPress: save, disabled: updateList.isPending },
      ]}
    >
      <View className="gap-1">
        <Text className="text-muted-foreground text-xs">Date</Text>
        <DateTimeField
          mode="date"
          value={date}
          onChange={setDate}
          placeholder="Aucune"
          clearable
          accessibilityLabel="Date d'échéance de la liste"
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
          onChange={setTime}
          placeholder="Aucune"
          clearable
          accessibilityLabel="Heure de l'échéance"
        />
      </View>
    </Modal>
  );
}
