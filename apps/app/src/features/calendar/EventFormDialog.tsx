import { useState } from "react";
import { View } from "react-native";
import type { CalendarEntry } from "@jc/domain";
import { ApiError } from "@jc/api-client";
import { Button } from "@/shared/ui/button";
import { DateTimeField } from "@/shared/ui/date-time-field";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Switch } from "@/shared/ui/switch";
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
  /** `groupId` : depuis une conversation d'espace, pour le calendrier de tous ses membres. */
  | { mode: "create"; day: Date; minute: number; groupId?: string }
  | { mode: "edit"; event: CalendarEntry };

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
  if (!target) return null;

  return <EventForm key={keyOf(target)} target={target} onClose={onClose} />;
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
    // Le formulaire ne porte qu'une date : une heure de plus depuis 23h
    // passerait au lendemain. La fin s'arrête donc à 23h59 — borner à 23h
    // donnait un créneau de 23h à 23h, que le serveur refusait.
    endTime: hour >= 23 ? "23:59" : `${String(hour + 1).padStart(2, "0")}:00`,
  };
}

function EventForm({ target, onClose }: { target: EventDialogTarget; onClose: () => void }) {
  const { create, update, remove } = useCalendarActions();
  const [values, setValues] = useState(() => initialValues(target));
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const editing = target.mode === "edit";
  const shared = target.mode === "edit" ? target.event.space !== null : Boolean(target.groupId);
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
      update.mutate({ event: target.event, patch: parsed.value }, options);
    } else {
      create.mutate(
        { ...parsed.value, ...(target.groupId ? { groupId: target.groupId } : {}) },
        options,
      );
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Modifier l'événement" : "Nouvel événement"}
      // Dire pour qui l'on écrit : un événement d'espace s'affiche chez tous.
      {...(shared
        ? { description: "Visible et modifiable par tous les membres de la conversation." }
        : {})}
      error={error}
      // Bascule du libellé plutôt que suppression au premier appui : le bouton
      // voisine désormais avec « Enregistrer », et un événement supprimé par
      // mégarde ne se rattrape pas. Même geste que sur une todoliste.
      {...(editing
        ? {
            destructiveAction: {
              label: confirmingDelete ? "Confirmer la suppression" : "Supprimer",
              variant: confirmingDelete ? "destructive" : "ghost",
              disabled: pending,
              onPress: () => {
                if (!confirmingDelete) {
                  setConfirmingDelete(true);
                  return;
                }
                remove.mutate(target.event, {
                  onSuccess: onClose,
                  onError: (cause: Error) => setError(toMessage(cause)),
                });
              },
            },
          }
        : {})}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: pending },
        {
          label: editing ? "Enregistrer" : "Ajouter",
          variant: "default",
          onPress: submit,
          disabled: pending,
        },
      ]}
    >
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
        <DateTimeField
          mode="date"
          value={values.date}
          onChange={(text) => patch("date", text)}
          accessibilityLabel="Date de l'événement"
        />
      </Field>

      <View className="flex-row items-center justify-between">
        <Text className="text-foreground text-sm">Journée entière</Text>
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
              <DateTimeField
                mode="time"
                value={values.startTime}
                onChange={(text) => patch("startTime", text)}
                accessibilityLabel="Heure de début"
              />
            </Field>
          </View>
          <View className="flex-1">
            <Field label="Fin">
              <DateTimeField
                mode="time"
                value={values.endTime}
                onChange={(text) => patch("endTime", text)}
                placeholder="Aucune"
                clearable
                accessibilityLabel="Heure de fin"
              />
            </Field>
          </View>
        </View>
      )}

      <Field label="Rappel">
        <View className="flex-row flex-wrap gap-2">
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
          className="h-24"
          accessibilityLabel="Notes"
        />
      </Field>
    </Modal>
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
