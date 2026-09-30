import { useState } from "react";
import { View } from "react-native";
import type { Task, UpdateTask } from "@jc/domain";
import { calendarDayOf, dateOfCalendarDay } from "@jc/domain";
import { ApiError } from "@jc/api-client";
import { DateTimeField } from "@/shared/ui/date-time-field";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Text } from "@/shared/ui/text";
import { useTaskActions } from "@/shared/hooks/use-task-lists";
import { formatDateInput, parseDateInput } from "@/shared/lib/date-input";

export type TaskDialogProps = {
  /** `null` = fenêtre fermée. */
  task: Task | null;
  onClose: () => void;
};

/**
 * Détail d'une tâche : son titre et ses notes.
 *
 * Pas d'échéance : elle appartient à la liste entière, et se pose sur elle.
 * La capture, elle, n'ouvre rien — on tape la ligne dans la liste et la tâche
 * existe (§13.4.1). Cette fenêtre sert à ce qui ne tient pas sur une ligne.
 */
export function TaskDialog({ task, onClose }: TaskDialogProps) {
  if (!task) return null;

  return <TaskForm key={task.id} task={task} onClose={onClose} />;
}

type TaskFormValues = { title: string; notes: string; dueOn: string };

function initialValues(task: Task): TaskFormValues {
  return {
    title: task.title,
    notes: task.notes ?? "",
    dueOn: task.dueOn === null ? "" : formatDateInput(dateOfCalendarDay(task.dueOn)),
  };
}

function TaskForm({ task, onClose }: { task: Task; onClose: () => void }) {
  const { updateTask } = useTaskActions();
  const [values, setValues] = useState(() => initialValues(task));
  const [error, setError] = useState<string | null>(null);

  const patch = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = () => {
    const parsed = parseForm(values, task.dueOn);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);

    updateTask.mutate(
      { listId: task.listId, taskId: task.id, patch: parsed.value },
      { onSuccess: onClose, onError: (cause: Error) => setError(toMessage(cause)) },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Modifier la tâche"
      error={error}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: updateTask.isPending },
        {
          label: "Enregistrer",
          variant: "default",
          onPress: submit,
          disabled: updateTask.isPending,
        },
      ]}
    >
      <Field label="Titre">
        <Input
          value={values.title}
          onChangeText={(text) => patch("title", text)}
          accessibilityLabel="Titre de la tâche"
        />
      </Field>

      {/* La date de la tâche, distincte de celle de sa liste : « le site pour
          le 12, les groupes pour le 14 » tiennent dans la même liste. */}
      <Field label="Échéance">
        <DateTimeField
          mode="date"
          value={values.dueOn}
          onChange={(text) => patch("dueOn", text)}
          placeholder="Aucune"
          clearable
          accessibilityLabel="Date d'échéance de la tâche"
        />
      </Field>

      <Field label="Notes">
        <Input
          value={values.notes}
          onChangeText={(text) => patch("notes", text)}
          multiline
          className="h-24"
          accessibilityLabel="Notes"
        />
      </Field>
    </Modal>
  );
}

type ParseResult = { ok: true; value: UpdateTask } | { ok: false; message: string };

function parseForm(values: TaskFormValues, originalDueOn: string | null): ParseResult {
  const title = values.title.trim();
  if (title.length === 0) return { ok: false, message: "Donnez un titre à la tâche." };

  const due = parseDueOn(values.dueOn, originalDueOn);
  if (!due.ok) return due;

  return { ok: true, value: { title, notes: values.notes.trim() || null, dueOn: due.value } };
}

type DueOnResult = { ok: true; value: string | null } | { ok: false; message: string };

/**
 * Jour saisi, ou son effacement — mêmes formats et même règle que l'échéance
 * d'une liste : aujourd'hui reste permis, un jour déjà révolu non, sauf à
 * garder celui que la tâche porte déjà.
 */
function parseDueOn(input: string, originalDueOn: string | null): DueOnResult {
  if (input.trim().length === 0) return { ok: true, value: null };

  const day = parseDateInput(input);
  if (day === "malformed") return { ok: false, message: "Date attendue au format JJ/MM/AAAA." };
  if (day === "impossible") return { ok: false, message: "Ce jour n'existe pas dans ce mois." };

  const dueOn = calendarDayOf(day);
  if (dueOn < calendarDayOf(new Date()) && dueOn !== originalDueOn) {
    return { ok: false, message: "Une échéance ne peut pas être dans le passé." };
  }

  return { ok: true, value: dueOn };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1">
      <Text className="text-muted-foreground text-xs">{label}</Text>
      {children}
    </View>
  );
}

/**
 * Un 400 vient de nos propres règles et porte un message écrit pour
 * l'utilisateur. Tout le reste est remplacé : une panne technique peut
 * transporter des fragments de requête.
 */
function toMessage(cause: Error): string {
  if (cause instanceof ApiError && cause.status === 400) return cause.message;
  return "L'enregistrement a échoué. Réessayez dans un instant.";
}
