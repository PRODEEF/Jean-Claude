import { useState } from "react";
import { View } from "react-native";
import {
  presetOfRrule,
  RECURRENCE_CHOICES,
  rruleForPreset,
  type CreateTaskList,
  type RecurrencePreset,
  type TaskList,
  type TaskListKind,
  type UpdateTaskList,
} from "@jc/domain";
import { ApiError } from "@jc/api-client";
import { Button } from "@/shared/ui/button";
import { DateTimeField } from "@/shared/ui/date-time-field";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Text } from "@/shared/ui/text";
import { useTaskActions } from "@/shared/hooks/use-task-lists";
import { useFolderChoices } from "@/shared/hooks/use-folder-choices";
import {
  formatDateInput,
  formatTimeInput,
  parseDateInput,
  parseTimeInput,
  withTime,
} from "@/shared/lib/date-input";
import { startOfDay } from "@/shared/lib/dates";
import { REMINDER_CHOICES } from "@/features/calendar/lib/event-form";

/**
 * Création — éventuellement depuis un dossier, qui exprime déjà le rangement —
 * ou modification d'une liste existante.
 */
export type TaskListTarget =
  | {
      mode: "create";
      folderId: string | null;
      /** Échéance déjà connue — le jour affiché, quand on ouvre depuis le calendrier. */
      dueAt?: string | null;
      /** Cette échéance vise-t-elle la journée ? Un jour ouvert au calendrier, oui. */
      dueAllDay?: boolean | null;
    }
  | { mode: "edit"; list: TaskList };

export type TaskListDialogProps = {
  /** `null` = fenêtre fermée. */
  target: TaskListTarget | null;
  onClose: () => void;
  /** Suit la liste créée — le calendrier y conduit pour qu'on la remplisse. */
  onCreated?: (list: TaskList) => void;
};

const KINDS: { value: TaskListKind; label: string }[] = [
  { value: "todo", label: "Tâches" },
  { value: "shopping", label: "Achats" },
];

export function TaskListDialog({ target, onClose, onCreated }: TaskListDialogProps) {
  if (!target) return null;

  return (
    <ListForm
      key={keyOf(target)}
      target={target}
      onClose={onClose}
      {...(onCreated ? { onCreated } : {})}
    />
  );
}

function keyOf(target: TaskListTarget): string {
  if (target.mode === "edit") return `edit-${target.list.id}`;
  // Le jour entre dans la clé : rouvrir la fenêtre depuis une autre journée du
  // calendrier doit repartir de cette journée-là, pas de la précédente.
  return `create-${target.folderId ?? "root"}-${target.dueAt ?? "undated"}`;
}

function ListForm({
  target,
  onClose,
  onCreated,
}: {
  target: TaskListTarget;
  onClose: () => void;
  onCreated?: (list: TaskList) => void;
}) {
  const { createList, updateList, fillList, removeList } = useTaskActions();
  const folders = useFolderChoices();
  const editing = target.mode === "edit";

  const [title, setTitle] = useState(editing ? target.list.title : "");
  const [kind, setKind] = useState<TaskListKind>(editing ? target.list.kind : "todo");
  const [folderId, setFolderId] = useState<string | null>(
    editing ? target.list.folderId : target.folderId,
  );
  const initialDue = editing ? target.list.dueAt : (target.dueAt ?? null);
  const initialAllDay = editing ? target.list.dueAllDay : (target.dueAllDay ?? null);
  /** `JJ/MM/AAAA`, vide quand la liste n'a pas d'échéance. */
  const [date, setDate] = useState(() =>
    initialDue === null ? "" : formatDateInput(new Date(initialDue)),
  );
  /** `HH:MM`, vide quand l'échéance ne vise pas d'heure précise. */
  const [time, setTime] = useState(() => timeOf(initialDue, initialAllDay));
  /** `HH:MM`, vide quand la liste n'a pas d'heure de fin. */
  const [endTime, setEndTime] = useState(() =>
    editing && target.list.endsAt !== null && initialAllDay === false
      ? formatTimeInput(new Date(target.list.endsAt))
      : "",
  );
  const [reminder, setReminder] = useState<number | null>(
    editing ? target.list.reminderMinutesBefore : null,
  );
  const [notes, setNotes] = useState(editing ? (target.list.notes ?? "") : "");
  const [location, setLocation] = useState(editing ? (target.list.location ?? "") : "");
  // `custom` : une règle de Jean-Claude (« sauf en février »…) que les quatre choix ne
  // disent pas. Elle reste telle quelle tant qu'on n'en choisit pas une autre.
  const [recurrence, setRecurrence] = useState<RecurrencePreset>(() =>
    editing
      ? presetOfRrule(
          target.list.rrule,
          target.list.dueAt ? new Date(target.list.dueAt) : new Date(),
        )
      : "none",
  );
  /** Une tâche par ligne, saisie avec la liste : création seulement. */
  const [itemsText, setItemsText] = useState("");
  /** La liste déjà créée quand l'écriture de ses tâches a échoué : on ne la recrée pas. */
  const [created, setCreated] = useState<TaskList | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Supprimer une liste emporte ses tâches : le second appui est ce qui
  // distingue le geste voulu du bouton frôlé.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const pending =
    createList.isPending || updateList.isPending || fillList.isPending || removeList.isPending;

  const submit = () => {
    // Un second appui après l'échec des tâches ne recrée pas la liste : il
    // retente seulement l'écriture des tâches.
    if (created) {
      saveItems(created);
      return;
    }

    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setError("Donnez un titre à la liste.");
      return;
    }
    setError(null);

    const due = parseDue(date, time, editing ? target.list.dueAt : null);
    if (!due.ok) {
      setError(due.message);
      return;
    }

    const onError = (cause: Error) => setError(toMessage(cause));

    // La fin et le rappel ne se règlent qu'à la modification, sur une liste qui a
    // une date : ce sont les réglages d'un rendez-vous, pas d'une liste d'achats.
    const end = parseEnd(due.value, time, endTime);
    if (!end.ok) {
      setError(end.message);
      return;
    }

    // `dueAllDay` n'accompagne l'échéance que lorsqu'il y en a une : sans date,
    // il n'y a pas de moment, et le serveur efface les deux ensemble.
    const moment = due.allDay === null ? {} : { dueAllDay: due.allDay };

    if (target.mode === "edit") {
      const patch: UpdateTaskList = {
        title: trimmed,
        kind,
        folderId,
        dueAt: due.value,
        ...moment,
        endsAt: end.value,
        reminderMinutesBefore: due.value === null ? null : reminder,
        notes: notes.trim().length > 0 ? notes.trim() : null,
        location: location.trim().length > 0 ? location.trim() : null,
        // Une règle personnalisée n'est pas réécrite ; sans date, il n'y a plus de série.
        ...(due.value === null
          ? { rrule: null }
          : recurrence === "custom"
            ? {}
            : { rrule: rruleForPreset(recurrence, new Date(due.value)) }),
      };
      updateList.mutate({ id: target.list.id, patch }, { onSuccess: onClose, onError });
      return;
    }

    const input: CreateTaskList = {
      title: trimmed,
      kind,
      dueAt: due.value,
      ...moment,
      ...(folderId ? { folderId } : {}),
    };
    createList.mutate(input, {
      onSuccess: (list) => {
        setCreated(list);
        saveItems(list);
      },
      onError,
    });
  };

  const saveItems = (list: TaskList) => {
    const items = itemsOf(itemsText);
    const done = () => {
      onClose();
      onCreated?.(list);
    };
    if (items.length === 0) {
      done();
      return;
    }

    fillList.mutate(
      { listId: list.id, input: { items: items.map((item) => ({ title: item, depth: 0 })) } },
      {
        onSuccess: done,
        onError: () =>
          setError(
            "La liste est créée, mais ses tâches n'ont pas pu être enregistrées. Réessayez.",
          ),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Modifier la liste" : "Nouvelle liste"}
      error={error}
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
                removeList.mutate(target.list.id, {
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
          label: editing ? "Enregistrer" : "Créer",
          variant: "default",
          onPress: submit,
          disabled: pending,
        },
      ]}
    >
      <Field label="Titre">
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder="Courses du week-end"
          autoFocus={!editing}
          accessibilityLabel="Titre de la liste"
        />
      </Field>

      {editing ? null : (
        <Field label="Tâches">
          <Input
            value={itemsText}
            onChangeText={setItemsText}
            multiline
            placeholder="Une tâche par ligne"
            className="h-24 py-2"
            accessibilityLabel="Tâches de la liste, une par ligne"
          />
        </Field>
      )}

      {/* Deux natures et non une : une liste d'achats et une liste de tâches
          issues d'un même sujet ne se fusionnent pas (§12.1). */}
      <Field label="Nature">
        <View className="flex-row gap-2">
          {KINDS.map((choice) => (
            <Button
              key={choice.value}
              variant={kind === choice.value ? "secondary" : "outline"}
              onPress={() => setKind(choice.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === choice.value }}
              className="flex-1"
            >
              <Text>{choice.label}</Text>
            </Button>
          ))}
        </View>
      </Field>

      {/* L'échéance porte sur la liste entière — « les courses avant samedi »
          date la liste, pas la farine. Elle est proposée dès la création parce
          qu'une liste ouverte depuis le calendrier naît sur un jour donné. */}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field label="Échéance">
            <DateTimeField
              mode="date"
              value={date}
              onChange={setDate}
              placeholder="Aucune"
              clearable
              accessibilityLabel="Date d'échéance de la liste"
            />
          </Field>
        </View>
        <View className="flex-1">
          <Field label="Heure">
            <DateTimeField
              mode="time"
              value={time}
              onChange={setTime}
              placeholder="Aucune"
              clearable
              accessibilityLabel="Heure de l'échéance"
            />
          </Field>
        </View>
      </View>

      {/* Sans heure, la liste se range dans « Dans la journée » : c'est le cas
          le plus courant, et l'imposer obligerait à inventer un horaire. */}
      <Text className="text-muted-foreground -mt-2 text-xs">
        Une date sans heure place la liste dans la journée, sans créneau.
      </Text>

      {/* Les réglages d'un rendez-vous, comme dans Google Agenda et le Calendrier
          iOS (§4.2) : fin, rappel, notes. Proposés à la modification d'une liste
          datée ; la création, elle, reste sans question (§13.4.1). */}
      {editing && date.trim().length > 0 ? (
        <>
          <Field label="Heure de fin">
            <DateTimeField
              mode="time"
              value={endTime}
              onChange={setEndTime}
              placeholder="Aucune"
              clearable
              accessibilityLabel="Heure de fin"
            />
          </Field>

          <Field label="Répétition">
            <View className="flex-row flex-wrap gap-2">
              {recurrence === "custom" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  accessibilityRole="button"
                  accessibilityState={{ selected: true }}
                >
                  <Text>Personnalisée</Text>
                </Button>
              ) : null}
              {RECURRENCE_CHOICES.map((choice) => (
                <Button
                  key={choice.preset}
                  size="sm"
                  variant={recurrence === choice.preset ? "secondary" : "outline"}
                  onPress={() => setRecurrence(choice.preset)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: recurrence === choice.preset }}
                >
                  <Text>{choice.label}</Text>
                </Button>
              ))}
            </View>
            {recurrence === "custom" ? (
              <Text className="text-muted-foreground text-xs">
                Règle créée par Jean-Claude (par exemple « sauf en février ») : elle reste telle
                quelle tant que vous n'en choisissez pas une autre.
              </Text>
            ) : null}
          </Field>

          <Field label="Rappel">
            <View className="flex-row flex-wrap gap-2">
              {REMINDER_CHOICES.map((choice) => (
                <Button
                  key={choice.label}
                  size="sm"
                  variant={reminder === choice.minutes ? "secondary" : "outline"}
                  onPress={() => setReminder(choice.minutes)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: reminder === choice.minutes }}
                >
                  <Text>{choice.label}</Text>
                </Button>
              ))}
            </View>
          </Field>
        </>
      ) : null}

      {editing ? (
        <Field label="Lieu">
          <Input
            value={location}
            onChangeText={setLocation}
            placeholder="Ajouter un lieu"
            accessibilityLabel="Lieu de la liste"
          />
        </Field>
      ) : null}

      {editing ? (
        <Field label="Notes">
          <Input
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Ajouter une description"
            className="h-24 py-2"
            accessibilityLabel="Notes de la liste"
          />
        </Field>
      ) : null}

      {/* Le rangement n'est proposé qu'à la modification : au moment de créer,
          on n'a pas encore à savoir où la liste ira (§13.4.1). */}
      {editing && folders.length > 0 ? (
        <Field label="Dossier">
          <View className="flex-row flex-wrap gap-2">
            <Button
              size="sm"
              variant={folderId === null ? "secondary" : "outline"}
              onPress={() => setFolderId(null)}
              accessibilityRole="button"
              accessibilityState={{ selected: folderId === null }}
            >
              <Text>Aucun</Text>
            </Button>
            {folders.map((folder) => (
              <Button
                key={folder.id}
                size="sm"
                variant={folderId === folder.id ? "secondary" : "outline"}
                onPress={() => setFolderId(folder.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: folderId === folder.id }}
              >
                <Text>{folder.name}</Text>
              </Button>
            ))}
          </View>
        </Field>
      ) : null}
    </Modal>
  );
}

/** Heure de l'échéance à la saisie, vide quand elle vise la journée entière. */
export function timeOf(dueAt: string | null, allDay: boolean | null): string {
  if (dueAt === null || allDay !== false) return "";
  return formatTimeInput(new Date(dueAt));
}

/**
 * `allDay` à `null` quand il n'y a pas d'échéance : le moment ne vit pas sans
 * elle, et c'est le champ d'heure laissé vide qui vaut « dans la journée ».
 */
type DueResult =
  { ok: true; value: string | null; allDay: boolean | null } | { ok: false; message: string };

/**
 * Échéance saisie, ou son effacement.
 *
 * Effacer la date retire l'échéance : la liste retourne parmi celles qui n'en
 * portent pas, sans pour autant disparaître.
 */
export function parseDue(date: string, time: string, originalDueAt: string | null): DueResult {
  if (date.trim().length === 0) {
    if (time.trim().length > 0) return { ok: false, message: "Indiquez une date avant une heure." };
    return { ok: true, value: null, allDay: null };
  }

  const day = parseDateInput(date);
  if (day === "malformed") return { ok: false, message: "Date attendue au format JJ/MM/AAAA." };
  if (day === "impossible") return { ok: false, message: "Ce jour n'existe pas dans ce mois." };

  // Même règle que le serveur : aujourd'hui reste permis, un jour déjà révolu
  // non — sauf à relire l'échéance déjà portée par la liste qu'on édite.
  const chosen = startOfDay(day).getTime();
  if (chosen < startOfDay(new Date()).getTime()) {
    const original = originalDueAt === null ? null : startOfDay(new Date(originalDueAt)).getTime();
    if (original !== chosen) {
      return { ok: false, message: "Une échéance ne peut pas être dans le passé." };
    }
  }

  if (time.trim().length === 0) return { ok: true, value: day.toISOString(), allDay: true };

  const parsed = parseTimeInput(time);
  if (!parsed) return { ok: false, message: "Heure attendue au format HH:MM." };

  return { ok: true, value: withTime(day, parsed), allDay: false };
}

type EndResult = { ok: true; value: string | null } | { ok: false; message: string };

/**
 * Heure de fin saisie, posée le même jour que le début.
 *
 * Elle exige un début avec heure et lui reste postérieure — la même règle que
 * le serveur (`task_lists_range_valid`), pour le dire ici plutôt que par une
 * erreur d'enregistrement.
 */
export function parseEnd(dueAt: string | null, startTime: string, endTime: string): EndResult {
  if (endTime.trim().length === 0 || dueAt === null) return { ok: true, value: null };
  if (startTime.trim().length === 0) {
    return { ok: false, message: "Indiquez une heure de début avant une heure de fin." };
  }

  const parsed = parseTimeInput(endTime);
  if (!parsed) return { ok: false, message: "Heure de fin attendue au format HH:MM." };

  const end = withTime(startOfDay(new Date(dueAt)), parsed);
  if (new Date(end).getTime() <= new Date(dueAt).getTime()) {
    return { ok: false, message: "La fin doit être après le début." };
  }
  return { ok: true, value: end };
}

/** Une tâche par ligne : les puces saisies à la main (« - », « • ») ne font pas partie du titre. */
function itemsOf(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/^[-•*]\s*/, ""))
    .filter((line) => line.length > 0);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1">
      <Text className="text-muted-foreground text-xs">{label}</Text>
      {children}
    </View>
  );
}

export function toMessage(cause: Error): string {
  if (cause instanceof ApiError && cause.status === 400) return cause.message;
  return "L'enregistrement a échoué. Réessayez dans un instant.";
}
