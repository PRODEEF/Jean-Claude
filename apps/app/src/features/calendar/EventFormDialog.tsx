import { useState } from "react";
import { View } from "react-native";
import { RECURRENCE_CHOICES, rruleForPreset, type CalendarEntry } from "@jc/domain";
import { ApiError } from "@jc/api-client";
import { DateTimeField } from "@/shared/ui/date-time-field";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Select } from "@/shared/ui/select";
import type { Point } from "@/shared/lib/popover-placement";
import { Switch } from "@/shared/ui/switch";
import { Text } from "@/shared/ui/text";
import { useTaskActions } from "@/shared/hooks/use-task-lists";
import { useCalendarActions } from "./hooks/use-calendar-events";
import {
  defaultEndFor,
  emptyForm,
  formFromEvent,
  parseForm,
  REMINDER_CHOICES,
  type EventFormValues,
} from "./lib/event-form";

const RECURRENCE_OPTIONS = RECURRENCE_CHOICES.map((choice) => ({
  value: choice.preset,
  label: choice.label,
}));

// `Select` ne parle qu'en chaînes : les minutes (ou `null`) y passent par leur texte.
const REMINDER_OPTIONS = REMINDER_CHOICES.map((choice) => ({
  value: String(choice.minutes),
  label: choice.label,
}));

export type EventDialogTarget =
  /** `groupId` : depuis une conversation d'espace, pour le calendrier de tous ses membres. */
  | {
      mode: "create";
      day: Date;
      minute: number;
      /** Posé sur « Journée » : le « + » d'un jour n'impose aucune heure. */
      allDay?: boolean;
      groupId?: string;
      anchor?: Point;
    }
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
    : `create-${target.day.toISOString()}-${target.minute}-${target.allDay ?? false}`;
}

function initialValues(target: EventDialogTarget): EventFormValues {
  if (target.mode === "edit") return formFromEvent(target.event);

  const hour = Math.floor(target.minute / 60);
  return {
    ...emptyForm(target.day),
    allDay: target.allDay ?? false,
    startTime: `${String(hour).padStart(2, "0")}:00`,
    // Le formulaire ne porte qu'une date : une heure de plus depuis 23h
    // passerait au lendemain. La fin s'arrête donc à 23h59 — borner à 23h
    // donnait un créneau de 23h à 23h, que le serveur refusait.
    endTime: hour >= 23 ? "23:59" : `${String(hour + 1).padStart(2, "0")}:00`,
  };
}

function EventForm({ target, onClose }: { target: EventDialogTarget; onClose: () => void }) {
  const { create, update, remove } = useCalendarActions();
  const { createList } = useTaskActions();
  const [values, setValues] = useState(() => initialValues(target));
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // À la création, la fin suit le début (+ 1 h) tant que l'utilisateur ne l'a
  // pas réglée lui-même. Un événement existant garde sa fin : la déplacer
  // d'office changerait sa durée sans que personne l'ait demandé.
  const [endTouched, setEndTouched] = useState(target.mode === "edit");

  const editing = target.mode === "edit";
  const personal = target.mode === "create" && !target.groupId;
  const shared = target.mode === "edit" ? target.event.space !== null : Boolean(target.groupId);
  const pending = create.isPending || update.isPending || remove.isPending || createList.isPending;

  const patch = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const changeStart = (text: string) =>
    setValues((current) => {
      const end = endTouched ? null : defaultEndFor(text);
      return { ...current, startTime: text, ...(end ? { endTime: end } : {}) };
    });

  const changeEnd = (text: string) => {
    setEndTouched(true);
    patch("endTime", text);
  };

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
    } else if (target.groupId) {
      // L'événement d'un espace reste un rendez-vous classique : il appartient à
      // la conversation, pas à la liste personnelle de quelqu'un.
      create.mutate({ ...parsed.value, groupId: target.groupId }, options);
    } else {
      // Un rendez-vous n'est plus un objet à part : c'est un todo daté, sans
      // tâche, qui garde son heure de fin, son rappel et ses notes (fusion
      // rendez-vous / todo, étape 5).
      createList.mutate(
        {
          title: parsed.value.title,
          kind: "todo",
          dueAt: parsed.value.startsAt,
          dueAllDay: parsed.value.allDay,
          endsAt: parsed.value.endsAt ?? null,
          reminderMinutesBefore: parsed.value.reminderMinutesBefore ?? null,
          notes: parsed.value.notes ?? null,
          location: values.location.trim() || null,
          // Le jour de la semaine, du mois ou de l'année vient du début choisi.
          rrule: rruleForPreset(values.recurrence, new Date(parsed.value.startsAt)),
        },
        options,
      );
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Modifier l'événement" : "Nouveau"}
      // Dire pour qui l'on écrit : un événement d'espace s'affiche chez tous.
      {...(shared
        ? { description: "Visible et modifiable par tous les membres de la conversation." }
        : {})}
      error={error}
      anchor={target.mode === "create" ? target.anchor : undefined}
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
          accessibilityLabel="Titre"
        />
      </Field>

      {/* Date, début et fin sur une seule ligne : le formulaire tient sans défiler. */}
      <View className="flex-row gap-2">
        <View className="flex-[1.6]">
          <Field label="Date">
            <DateTimeField
              mode="date"
              value={values.date}
              onChange={(text) => patch("date", text)}
              accessibilityLabel="Date"
            />
          </Field>
        </View>
        {values.allDay ? null : (
          <>
            <View className="flex-1">
              <Field label="Début">
                <DateTimeField
                  mode="time"
                  value={values.startTime}
                  onChange={changeStart}
                  accessibilityLabel="Heure de début"
                />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="Fin">
                <DateTimeField
                  mode="time"
                  value={values.endTime}
                  onChange={changeEnd}
                  placeholder="Aucune"
                  clearable
                  accessibilityLabel="Heure de fin"
                />
              </Field>
            </View>
          </>
        )}
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="text-foreground text-sm">Journée entière</Text>
        <Switch
          value={values.allDay}
          onValueChange={(next) => patch("allDay", next)}
          accessibilityLabel="Journée entière"
        />
      </View>

      {/* Répétition et rappel côte à côte, en listes déroulantes : onze boutons
          en rang pesaient plus que le reste du formulaire. Répétition et lieu :
          les rendez-vous personnels seulement, ceux d'un espace restent des
          rendez-vous classiques. */}
      <View className="flex-row gap-2">
        {personal ? (
          <View className="flex-1">
            <Field label="Répétition">
              <Select
                value={values.recurrence}
                options={RECURRENCE_OPTIONS}
                onChange={(preset) => patch("recurrence", preset)}
                placeholder="Aucune"
                accessibilityLabel="Répétition"
              />
            </Field>
          </View>
        ) : null}
        <View className="flex-1">
          <Field label="Rappel">
            <Select
              value={String(values.reminderMinutesBefore)}
              options={REMINDER_OPTIONS}
              onChange={(key) =>
                patch(
                  "reminderMinutesBefore",
                  REMINDER_CHOICES.find((choice) => String(choice.minutes) === key)?.minutes ??
                    null,
                )
              }
              placeholder="Aucun"
              accessibilityLabel="Rappel"
            />
          </Field>
        </View>
      </View>

      {personal ? (
        <Field label="Lieu">
          <Input
            value={values.location}
            onChangeText={(text) => patch("location", text)}
            placeholder="Ajouter un lieu"
            accessibilityLabel="Lieu"
          />
        </Field>
      ) : null}

      <Field label="Notes">
        <Input
          value={values.notes}
          onChangeText={(text) => patch("notes", text)}
          multiline
          className="h-16"
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
