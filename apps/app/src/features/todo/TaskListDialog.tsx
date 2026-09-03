import { useState } from "react";
import { ScrollView, View } from "react-native";
import type { CreateTaskList, TaskList, TaskListKind, UpdateTaskList } from "@jc/domain";
import { ApiError } from "@jc/api-client";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
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
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {target ? (
          <ListForm
            key={keyOf(target)}
            target={target}
            onClose={onClose}
            {...(onCreated ? { onCreated } : {})}
          />
        ) : null}
      </DialogContent>
    </Dialog>
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
  const { createList, updateList, removeList } = useTaskActions();
  const folders = useFolderChoices();
  const editing = target.mode === "edit";

  const [title, setTitle] = useState(editing ? target.list.title : "");
  const [kind, setKind] = useState<TaskListKind>(editing ? target.list.kind : "todo");
  const [folderId, setFolderId] = useState<string | null>(
    editing ? target.list.folderId : target.folderId,
  );
  const initialDue = editing ? target.list.dueAt : (target.dueAt ?? null);
  /** `JJ/MM/AAAA`, vide quand la liste n'a pas d'échéance. */
  const [date, setDate] = useState(() =>
    initialDue === null ? "" : formatDateInput(new Date(initialDue)),
  );
  /** `HH:MM`, vide quand l'échéance ne vise pas d'heure précise. */
  const [time, setTime] = useState(() => timeOf(initialDue));
  const [error, setError] = useState<string | null>(null);
  // Supprimer une liste emporte ses tâches : le second appui est ce qui
  // distingue le geste voulu du bouton frôlé.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const pending = createList.isPending || updateList.isPending || removeList.isPending;

  const submit = () => {
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setError("Donnez un titre à la liste.");
      return;
    }
    setError(null);

    const due = parseDue(date, time);
    if (!due.ok) {
      setError(due.message);
      return;
    }

    const onError = (cause: Error) => setError(toMessage(cause));

    if (target.mode === "edit") {
      const patch: UpdateTaskList = { title: trimmed, kind, folderId, dueAt: due.value };
      updateList.mutate({ id: target.list.id, patch }, { onSuccess: onClose, onError });
      return;
    }

    const input: CreateTaskList = {
      title: trimmed,
      kind,
      dueAt: due.value,
      ...(folderId ? { folderId } : {}),
    };
    createList.mutate(input, {
      onSuccess: (created) => {
        onClose();
        onCreated?.(created);
      },
      onError,
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? "Modifier la liste" : "Nouvelle liste"}</DialogTitle>
      </DialogHeader>

      <ScrollView style={{ maxHeight: 360 }} contentContainerClassName="gap-3">
        <Field label="Titre">
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder="Courses du week-end"
            autoFocus={!editing}
            accessibilityLabel="Titre de la liste"
          />
        </Field>

        {/* Deux natures et non une : une liste d'achats et une liste de tâches
            issues d'un même sujet ne se fusionnent pas (§12.1). */}
        <Field label="Nature">
          <View className="flex-row gap-1">
            {KINDS.map((choice) => (
              <Button
                key={choice.value}
                size="sm"
                variant={kind === choice.value ? "secondary" : "outline"}
                onPress={() => setKind(choice.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: kind === choice.value }}
              >
                <Text>{choice.label}</Text>
              </Button>
            ))}
          </View>
        </Field>

        {/* L'échéance porte sur la liste entière — « les courses avant
            samedi » date la liste, pas la farine. Elle est proposée dès la
            création parce qu'une liste ouverte depuis le calendrier naît sur
            un jour donné. */}
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field label="Échéance">
              <Input
                value={date}
                onChangeText={setDate}
                placeholder="JJ/MM/AAAA"
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="Date d'échéance de la liste"
              />
            </Field>
          </View>
          <View className="flex-1">
            <Field label="Heure">
              <Input
                value={time}
                onChangeText={setTime}
                placeholder="HH:MM"
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="Heure de l'échéance"
              />
            </Field>
          </View>
        </View>

        {/* Sans heure, la liste se range dans « Dans la journée » : c'est le
            cas le plus courant, et l'imposer obligerait à inventer un horaire. */}
        <Text className="text-muted-foreground text-xs">
          Une date sans heure place la liste dans la journée, sans créneau.
        </Text>

        {/* Le rangement n'est proposé qu'à la modification : au moment de
            créer, on n'a pas encore à savoir où la liste ira (§13.4.1). */}
        {editing && folders.length > 0 ? (
          <Field label="Dossier">
            <View className="flex-row flex-wrap gap-1">
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

        {error ? <Text className="text-destructive text-sm">{error}</Text> : null}
      </ScrollView>

      <DialogFooter>
        {editing ? (
          <Button
            variant="destructive"
            disabled={pending}
            onPress={() => {
              if (!confirmingDelete) {
                setConfirmingDelete(true);
                return;
              }
              removeList.mutate(target.list.id, {
                onSuccess: onClose,
                onError: (cause: Error) => setError(toMessage(cause)),
              });
            }}
          >
            <Text>{confirmingDelete ? "Confirmer la suppression" : "Supprimer"}</Text>
          </Button>
        ) : null}
        <Button variant="outline" onPress={onClose} disabled={pending}>
          <Text>Annuler</Text>
        </Button>
        <Button onPress={submit} disabled={pending}>
          <Text>{editing ? "Enregistrer" : "Créer"}</Text>
        </Button>
      </DialogFooter>
    </>
  );
}

/** Heure de l'échéance à la saisie, vide quand elle vise minuit — donc la journée. */
function timeOf(dueAt: string | null): string {
  if (dueAt === null) return "";
  const due = new Date(dueAt);
  return due.getHours() === 0 && due.getMinutes() === 0 ? "" : formatTimeInput(due);
}

type DueResult = { ok: true; value: string | null } | { ok: false; message: string };

/**
 * Échéance saisie, ou son effacement.
 *
 * Effacer la date retire l'échéance : la liste retourne parmi celles qui n'en
 * portent pas, sans pour autant disparaître.
 */
function parseDue(date: string, time: string): DueResult {
  if (date.trim().length === 0) {
    if (time.trim().length > 0) return { ok: false, message: "Indiquez une date avant une heure." };
    return { ok: true, value: null };
  }

  const day = parseDateInput(date);
  if (day === "malformed") return { ok: false, message: "Date attendue au format JJ/MM/AAAA." };
  if (day === "impossible") return { ok: false, message: "Ce jour n'existe pas dans ce mois." };

  if (time.trim().length === 0) return { ok: true, value: day.toISOString() };

  const parsed = parseTimeInput(time);
  if (!parsed) return { ok: false, message: "Heure attendue au format HH:MM." };

  return { ok: true, value: withTime(day, parsed) };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1">
      <Text className="text-muted-foreground text-xs">{label}</Text>
      {children}
    </View>
  );
}

function toMessage(cause: Error): string {
  if (cause instanceof ApiError && cause.status === 400) return cause.message;
  return "L'enregistrement a échoué. Réessayez dans un instant.";
}
