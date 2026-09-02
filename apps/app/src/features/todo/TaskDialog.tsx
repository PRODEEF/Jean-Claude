import { useState } from "react";
import { View } from "react-native";
import type { Task, UpdateTask } from "@jc/domain";
import { ApiError } from "@jc/api-client";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Text } from "@/shared/ui/text";
import {
  formatDateInput,
  formatTimeInput,
  parseDateInput,
  parseTimeInput,
  withTime,
} from "@/shared/lib/date-input";
import { useTaskActions } from "@/shared/hooks/use-task-lists";

export type TaskDialogProps = {
  /** `null` = fenêtre fermée. */
  task: Task | null;
  onClose: () => void;
};

/**
 * Détail d'une tâche : son titre, son échéance, ses notes.
 *
 * La capture, elle, n'ouvre rien : on tape un titre au bas de la liste et la
 * tâche existe (§13.4.1). Cette fenêtre sert à ce qui vient après — dater,
 * préciser, corriger.
 */
export function TaskDialog({ task, onClose }: TaskDialogProps) {
  return (
    <Dialog
      open={task !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {task ? <TaskForm key={task.id} task={task} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

type TaskFormValues = {
  title: string;
  /** `JJ/MM/AAAA`, vide quand la tâche n'a pas d'échéance. */
  date: string;
  /** `HH:MM`, vide quand l'échéance ne vise pas d'heure précise. */
  time: string;
  notes: string;
};

function initialValues(task: Task): TaskFormValues {
  if (task.dueAt === null) {
    return { title: task.title, date: "", time: "", notes: task.notes ?? "" };
  }

  const due = new Date(task.dueAt);
  const timed = due.getHours() !== 0 || due.getMinutes() !== 0;

  return {
    title: task.title,
    date: formatDateInput(due),
    time: timed ? formatTimeInput(due) : "",
    notes: task.notes ?? "",
  };
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
    <>
      <DialogHeader>
        <DialogTitle>Modifier la tâche</DialogTitle>
      </DialogHeader>

      <View className="gap-3">
        <Field label="Titre">
          <Input
            value={values.title}
            onChangeText={(text) => patch("title", text)}
            accessibilityLabel="Titre de la tâche"
          />
        </Field>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field label="Échéance">
              <Input
                value={values.date}
                onChangeText={(text) => patch("date", text)}
                placeholder="JJ/MM/AAAA"
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="Date d'échéance"
              />
            </Field>
          </View>
          <View className="flex-1">
            <Field label="Heure">
              <Input
                value={values.time}
                onChangeText={(text) => patch("time", text)}
                placeholder="HH:MM"
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="Heure de l'échéance"
              />
            </Field>
          </View>
        </View>

        {/* Sans heure, la tâche se range dans « Dans la journée » : c'est le
            cas le plus courant, et l'imposer obligerait à inventer un horaire. */}
        <Text className="text-muted-foreground text-xs">
          Une date sans heure place la tâche dans la journée, sans créneau.
        </Text>

        <Field label="Notes">
          <Input
            value={values.notes}
            onChangeText={(text) => patch("notes", text)}
            multiline
            className="h-20"
            accessibilityLabel="Notes"
          />
        </Field>

        {error ? <Text className="text-destructive text-sm">{error}</Text> : null}
      </View>

      <DialogFooter>
        <Button variant="outline" onPress={onClose} disabled={updateTask.isPending}>
          <Text>Annuler</Text>
        </Button>
        <Button onPress={submit} disabled={updateTask.isPending}>
          <Text>Enregistrer</Text>
        </Button>
      </DialogFooter>
    </>
  );
}

type ParseResult = { ok: true; value: UpdateTask } | { ok: false; message: string };

function parseForm(values: TaskFormValues): ParseResult {
  const title = values.title.trim();
  if (title.length === 0) return { ok: false, message: "Donnez un titre à la tâche." };

  const notes = values.notes.trim() || null;

  // Effacer la date efface l'échéance : la tâche retourne dans sa liste sans
  // pour autant disparaître.
  if (values.date.trim().length === 0) {
    if (values.time.trim().length > 0) {
      return { ok: false, message: "Indiquez une date avant une heure." };
    }
    return { ok: true, value: { title, dueAt: null, notes } };
  }

  const day = parseDateInput(values.date);
  if (day === "malformed") return { ok: false, message: "Date attendue au format JJ/MM/AAAA." };
  if (day === "impossible") return { ok: false, message: "Ce jour n'existe pas dans ce mois." };

  if (values.time.trim().length === 0) {
    return { ok: true, value: { title, dueAt: day.toISOString(), notes } };
  }

  const time = parseTimeInput(values.time);
  if (!time) return { ok: false, message: "Heure attendue au format HH:MM." };

  return { ok: true, value: { title, dueAt: withTime(day, time), notes } };
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
