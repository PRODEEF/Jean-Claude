import { useState } from "react";
import { ScrollView, View } from "react-native";
import type { TaskList, TaskListKind } from "@jc/domain";
import { ApiError } from "@jc/api-client";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Text } from "@/shared/ui/text";
import { useTaskActions } from "@/shared/hooks/use-task-lists";
import { useFolderChoices } from "@/shared/hooks/use-folder-choices";

/**
 * Création — éventuellement depuis un dossier, qui exprime déjà le rangement —
 * ou modification d'une liste existante.
 */
export type TaskListTarget =
  | { mode: "create"; folderId: string | null }
  | { mode: "edit"; list: TaskList };

export type TaskListDialogProps = {
  /** `null` = fenêtre fermée. */
  target: TaskListTarget | null;
  onClose: () => void;
};

const KINDS: { value: TaskListKind; label: string }[] = [
  { value: "todo", label: "Tâches" },
  { value: "shopping", label: "Achats" },
];

export function TaskListDialog({ target, onClose }: TaskListDialogProps) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {target ? <ListForm key={keyOf(target)} target={target} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function keyOf(target: TaskListTarget): string {
  return target.mode === "edit" ? `edit-${target.list.id}` : `create-${target.folderId ?? "root"}`;
}

function ListForm({ target, onClose }: { target: TaskListTarget; onClose: () => void }) {
  const { createList, updateList, removeList } = useTaskActions();
  const folders = useFolderChoices();
  const editing = target.mode === "edit";

  const [title, setTitle] = useState(editing ? target.list.title : "");
  const [kind, setKind] = useState<TaskListKind>(editing ? target.list.kind : "todo");
  const [folderId, setFolderId] = useState<string | null>(
    editing ? target.list.folderId : target.folderId,
  );
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

    const options = { onSuccess: onClose, onError: (cause: Error) => setError(toMessage(cause)) };
    if (target.mode === "edit") {
      updateList.mutate({ id: target.list.id, patch: { title: trimmed, kind, folderId } }, options);
    } else {
      createList.mutate({ title: trimmed, kind, ...(folderId ? { folderId } : {}) }, options);
    }
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
