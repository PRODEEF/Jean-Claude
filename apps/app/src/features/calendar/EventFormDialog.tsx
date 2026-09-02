import { useState } from "react";
import { ScrollView, Switch, View } from "react-native";
import type { CalendarEvent } from "@jc/domain";
import { ApiError } from "@jc/api-client";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Text } from "@/shared/ui/text";
import { useCalendarActions } from "./hooks/use-calendar-events";
import {
  emptyForm,
  formFromEvent,
  parseForm,
  REMINDER_CHOICES,
  type EventFormValues,
} from "./lib/event-form";

export type EventDialogTarget =
  { mode: "create"; day: Date; minute: number } | { mode: "edit"; event: CalendarEvent };

export type EventFormDialogProps = {
  /** `null` = fenêtre fermée. */
  target: EventDialogTarget | null;
  onClose: () => void;
};

/**
 * Création et modification d'un événement.
 *
 * Le formulaire est monté avec une clé dérivée de sa cible : la saisie repart
 * de zéro à chaque ouverture, sans effet de synchronisation à écrire.
 */
export function EventFormDialog({ target, onClose }: EventFormDialogProps) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {target ? <EventForm key={keyOf(target)} target={target} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function keyOf(target: EventDialogTarget): string {
  return target.mode === "edit"
    ? `edit-${target.event.id}`
    : `create-${target.day.toISOString()}-${target.minute}`;
}

function initialValues(target: EventDialogTarget): EventFormValues {
  if (target.mode === "edit") return formFromEvent(target.event);

  const hour = Math.floor(target.minute / 60);
  return {
    ...emptyForm(target.day),
    startTime: `${String(hour).padStart(2, "0")}:00`,
    endTime: `${String(Math.min(hour + 1, 23)).padStart(2, "0")}:00`,
  };
}

function EventForm({ target, onClose }: { target: EventDialogTarget; onClose: () => void }) {
  const { create, update, remove } = useCalendarActions();
  const [values, setValues] = useState(() => initialValues(target));
  const [error, setError] = useState<string | null>(null);

  const editing = target.mode === "edit";
  const pending = create.isPending || update.isPending || remove.isPending;

  const patch = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = () => {
    const parsed = parseForm(values);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);

    const options = { onSuccess: onClose, onError: (cause: Error) => setError(toMessage(cause)) };
    if (target.mode === "edit") {
      update.mutate({ id: target.event.id, patch: parsed.value }, options);
    } else {
      create.mutate(parsed.value, options);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? "Modifier l'événement" : "Nouvel événement"}</DialogTitle>
      </DialogHeader>

      <ScrollView style={{ maxHeight: 400 }} contentContainerClassName="gap-3">
        <Field label="Titre">
          <Input
            value={values.title}
            onChangeText={(text) => patch("title", text)}
            placeholder="Rendez-vous chez le kiné"
            autoFocus={!editing}
            accessibilityLabel="Titre de l'événement"
          />
        </Field>

        <Field label="Date">
          <Input
            value={values.date}
            onChangeText={(text) => patch("date", text)}
            placeholder="JJ/MM/AAAA"
            keyboardType="numbers-and-punctuation"
            accessibilityLabel="Date de l'événement"
          />
        </Field>

        <View className="flex-row items-center justify-between">
          <Text className="text-sm">Journée entière</Text>
          <Switch
            value={values.allDay}
            onValueChange={(next) => patch("allDay", next)}
            accessibilityLabel="Journée entière"
          />
        </View>

        {values.allDay ? null : (
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Début">
                <Input
                  value={values.startTime}
                  onChangeText={(text) => patch("startTime", text)}
                  placeholder="HH:MM"
                  keyboardType="numbers-and-punctuation"
                  accessibilityLabel="Heure de début"
                />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="Fin">
                <Input
                  value={values.endTime}
                  onChangeText={(text) => patch("endTime", text)}
                  placeholder="HH:MM"
                  keyboardType="numbers-and-punctuation"
                  accessibilityLabel="Heure de fin"
                />
              </Field>
            </View>
          </View>
        )}

        <Field label="Rappel">
          <View className="flex-row flex-wrap gap-1">
            {REMINDER_CHOICES.map((choice) => (
              <Button
                key={choice.label}
                size="sm"
                variant={values.reminderMinutesBefore === choice.minutes ? "secondary" : "outline"}
                onPress={() => patch("reminderMinutesBefore", choice.minutes)}
                accessibilityRole="button"
                accessibilityState={{ selected: values.reminderMinutesBefore === choice.minutes }}
              >
                <Text>{choice.label}</Text>
              </Button>
            ))}
          </View>
        </Field>

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
      </ScrollView>

      <DialogFooter>
        {editing ? (
          <Button
            variant="destructive"
            disabled={pending}
            onPress={() =>
              remove.mutate(target.event.id, {
                onSuccess: onClose,
                onError: (cause: Error) => setError(toMessage(cause)),
              })
            }
          >
            <Text>Supprimer</Text>
          </Button>
        ) : null}
        <Button variant="outline" onPress={onClose} disabled={pending}>
          <Text>Annuler</Text>
        </Button>
        <Button onPress={submit} disabled={pending}>
          <Text>{editing ? "Enregistrer" : "Ajouter"}</Text>
        </Button>
      </DialogFooter>
    </>
  );
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
