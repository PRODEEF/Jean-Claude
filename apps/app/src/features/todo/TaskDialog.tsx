import { useState } from "react";
import { View } from "react-native";
import type { Task, UpdateTask } from "@jc/domain";
import { ApiError } from "@jc/api-client";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Text } from "@/shared/ui/text";
import { useTaskActions } from "@/shared/hooks/use-task-lists";

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

type TaskFormValues = { title: string; notes: string };

function initialValues(task: Task): TaskFormValues {
  return { title: task.title, notes: task.notes ?? "" };
}

function TaskForm({ task, onClose }: { task: Task; onClose: () => void }) {
  const { updateTask } = useTaskActions();
  const [values, setValues] = useState(() => initialValues(task));
  const [error, setError] = useState<string | null>(null);

  const patch = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = () => {
    const parsed = parseForm(values);
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

function parseForm(values: TaskFormValues): ParseResult {
  const title = values.title.trim();
  if (title.length === 0) return { ok: false, message: "Donnez un titre à la tâche." };

  return { ok: true, value: { title, notes: values.notes.trim() || null } };
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
