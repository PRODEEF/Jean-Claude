import { useState } from "react";
import { View } from "react-native";
import { dayPartDefaultTime, dayPartOfHour, type DayPart, type TaskList } from "@jc/domain";
import { DateTimeField } from "@/shared/ui/date-time-field";
import { Modal } from "@/shared/ui/modal";
import { SegmentedControl, type SegmentedOption } from "@/shared/ui/segmented-control";
import { Text } from "@/shared/ui/text";
import { useTaskActions } from "@/shared/hooks/use-task-lists";
import { useDayPartBounds } from "@/shared/hooks/use-profile";
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

/** Échéance à enregistrer : sans date, les deux champs vont ensemble (`null`, rien). */
export type DueSubmit = { dueAt: string | null; dueAllDay?: boolean };

export type DueDialogProps = {
  /** Le nom de la liste, rappelé sous le titre. */
  title: string;
  dueAt: string | null;
  dueAllDay: boolean | null;
  pending: boolean;
  /** Échec de l'enregistrement, déjà écrit pour l'utilisateur. */
  failure: string | null;
  onSubmit: (due: DueSubmit) => void;
  onClose: () => void;
};

/**
 * Changer l'échéance d'une liste depuis son en-tête, sans passer par
 * « Modifier la liste ». Commun aux listes personnelles et à celles d'un
 * espace : la saisie et ses règles sont les mêmes, seul l'enregistrement
 * diffère.
 *
 * Le jour, le mois et l'année se règlent dans le champ de date, segment par
 * segment. Le moment de la journée n'est qu'un raccourci pour l'heure : il la
 * pose, et se relit d'après elle (`dayPartOfHour`).
 */
export function DueDialog({
  title,
  dueAt,
  dueAllDay,
  pending,
  failure,
  onSubmit,
  onClose,
}: DueDialogProps) {
  /** `JJ/MM/AAAA`, vide quand la liste n'a pas d'échéance. */
  const [date, setDate] = useState(() => (dueAt === null ? "" : formatDateInput(new Date(dueAt))));
  /** `HH:MM`, vide quand l'échéance ne vise pas d'heure précise. */
  const [time, setTime] = useState(() => timeOf(dueAt, dueAllDay));
  const [error, setError] = useState<string | null>(null);

  const bounds = useDayPartBounds();
  const typed = parseTimeInput(time);
  const moment: Moment = typed ? dayPartOfHour(typed.hours, bounds) : "day";

  const chooseMoment = (next: Moment) => {
    if (next === "day") {
      setTime("");
      return;
    }
    // Une heure déjà dans ce moment reste telle quelle : « 10h » n'a pas à
    // devenir « 9h » parce qu'on touche « Matin ».
    if (moment === next) return;

    setTime(dayPartDefaultTime(next, bounds));
    // Une heure sans date n'est pas une échéance : on propose aujourd'hui.
    if (date.trim().length === 0) setDate(formatDateInput(new Date()));
  };

  const save = () => {
    const due = parseDue(date, time, dueAt);
    if (!due.ok) {
      setError(due.message);
      return;
    }
    setError(null);

    // Sans date, il n'y a pas de moment : le serveur efface les deux ensemble.
    onSubmit({ dueAt: due.value, ...(due.allDay === null ? {} : { dueAllDay: due.allDay }) });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Échéance"
      description={title}
      error={error ?? failure}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: pending },
        { label: "Enregistrer", variant: "default", onPress: save, disabled: pending },
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

/** L'échéance d'une liste personnelle, enregistrée par `PATCH /tasks/:id`. */
export function ListDueDialog({ list, onClose }: { list: TaskList; onClose: () => void }) {
  const { updateList } = useTaskActions();
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <DueDialog
      title={list.title}
      dueAt={list.dueAt}
      dueAllDay={list.dueAllDay}
      pending={updateList.isPending}
      failure={failure}
      onSubmit={(patch) =>
        updateList.mutate(
          { id: list.id, patch },
          { onSuccess: onClose, onError: (cause) => setFailure(toMessage(cause)) },
        )
      }
      onClose={onClose}
    />
  );
}
