import { useState } from "react";
import { View } from "react-native";
import { Check } from "lucide-react-native";
import type { FolderTreeNode, WorkspaceTaskList } from "@jc/domain";
import { useWorkspaceFolders } from "@/features/workspace/hooks/use-workspace-folders";
import { workspaceErrorMessage } from "@/features/workspace/hooks/use-workspaces";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Text } from "@/shared/ui/text";
import { useCreateWorkspaceList, useWorkspaceListActions } from "./hooks/use-workspace-lists";

/** Ce que la fenêtre s'apprête à faire d'une liste d'espace. */
export type WorkspaceListTarget =
  | { kind: "create"; workspaceId: string }
  | { kind: "rename"; list: WorkspaceTaskList }
  | { kind: "folder"; list: WorkspaceTaskList }
  | { kind: "delete"; list: WorkspaceTaskList };

export type WorkspaceListDialogProps = {
  /** `null` = fenêtre fermée. */
  target: WorkspaceListTarget | null;
  onClose: () => void;
  /** Liste créée, ou supprimée — l'appelant décide où aller ensuite. */
  onDone?: (list: WorkspaceTaskList | null) => void;
};

export function WorkspaceListDialog({ target, onClose, onDone }: WorkspaceListDialogProps) {
  if (!target) return null;

  switch (target.kind) {
    case "create":
      return (
        <CreateForm
          workspaceId={target.workspaceId}
          onClose={onClose}
          onCreated={(list) => onDone?.(list)}
        />
      );
    case "rename":
      return <RenameForm key={target.list.id} list={target.list} onClose={onClose} />;
    case "folder":
      return <FolderPicker key={target.list.id} list={target.list} onClose={onClose} />;
    case "delete":
      return (
        <DeleteConfirmation list={target.list} onClose={onClose} onDeleted={() => onDone?.(null)} />
      );
  }
}

function TitleField({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium">Nom de la liste</Text>
      <Input
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder="Courses de la kermesse, Préparatifs…"
        maxLength={120}
        autoFocus
        returnKeyType="done"
        accessibilityLabel="Nom de la liste"
      />
    </View>
  );
}

function CreateForm({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: (list: WorkspaceTaskList) => void;
}) {
  const create = useCreateWorkspaceList(workspaceId);
  const [title, setTitle] = useState("");
  const trimmed = title.trim();
  const submit = () => {
    if (trimmed && !create.isPending) create.mutate(trimmed, { onSuccess: onCreated });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouvelle liste"
      description="Visible et cochable par tous les membres de l'espace."
      error={workspaceErrorMessage(create.error, "La liste n'a pas pu être créée.")}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: create.isPending },
        {
          label: "Créer",
          variant: "default",
          onPress: submit,
          disabled: !trimmed || create.isPending,
        },
      ]}
    >
      <TitleField value={title} onChange={setTitle} onSubmit={submit} />
    </Modal>
  );
}

function RenameForm({ list, onClose }: { list: WorkspaceTaskList; onClose: () => void }) {
  const { update } = useWorkspaceListActions(list);
  const [title, setTitle] = useState(list.title);
  const trimmed = title.trim();
  const submit = () => {
    if (trimmed && !update.isPending) update.mutate({ title: trimmed }, { onSuccess: onClose });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Renommer la liste"
      error={workspaceErrorMessage(update.error, "Le renommage a échoué.")}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: update.isPending },
        {
          label: "Renommer",
          variant: "default",
          onPress: submit,
          disabled: !trimmed || update.isPending,
        },
      ]}
    >
      <TitleField value={title} onChange={setTitle} onSubmit={submit} />
    </Modal>
  );
}

/** Un seul dossier par liste, comme pour une todoliste personnelle. */
function FolderPicker({ list, onClose }: { list: WorkspaceTaskList; onClose: () => void }) {
  const folders = useWorkspaceFolders(list.workspaceId);
  const { update } = useWorkspaceListActions(list);
  const [folderId, setFolderId] = useState<string | null>(list.folderId);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Ranger « ${list.title} »`}
      description="Dans un dossier de l'espace."
      error={workspaceErrorMessage(update.error, "Le rangement a échoué.")}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: update.isPending },
        {
          label: "Enregistrer",
          variant: "default",
          disabled: update.isPending,
          onPress: () => update.mutate({ folderId }, { onSuccess: onClose }),
        },
      ]}
    >
      <View className="overflow-hidden rounded-md border border-border">
        <Choice
          label="Aucun dossier"
          selected={folderId === null}
          onPress={() => setFolderId(null)}
        />
        <FolderChoices nodes={folders.data ?? []} selected={folderId} onSelect={setFolderId} />
      </View>
    </Modal>
  );
}

function FolderChoices({
  nodes,
  selected,
  onSelect,
}: {
  nodes: FolderTreeNode[];
  selected: string | null;
  onSelect: (folderId: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <View key={node.id}>
          <Choice
            label={node.name}
            selected={selected === node.id}
            onPress={() => onSelect(node.id)}
          />
          {node.children.length > 0 ? (
            <View className="ml-5 border-l border-border pl-1">
              <FolderChoices nodes={node.children} selected={selected} onSelect={onSelect} />
            </View>
          ) : null}
        </View>
      ))}
    </>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      variant="ghost"
      onPress={onPress}
      role="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      className="h-11 justify-start gap-3 rounded-none px-3 sm:h-11"
    >
      <View className="size-5 items-center justify-center rounded-full border border-border">
        {selected ? <Icon as={Check} size={12} className="text-foreground" /> : null}
      </View>
      <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
        {label}
      </Text>
    </Button>
  );
}

function DeleteConfirmation({
  list,
  onClose,
  onDeleted,
}: {
  list: WorkspaceTaskList;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { remove } = useWorkspaceListActions(list);

  return (
    <Modal
      open
      onClose={onClose}
      variant="confirm"
      title={`Supprimer « ${list.title} » ?`}
      description="Pour tous les membres de l'espace, avec toutes ses tâches."
      error={remove.isError ? "La suppression a échoué. Réessayez dans un instant." : null}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: remove.isPending },
        {
          label: "Supprimer",
          variant: "destructive",
          disabled: remove.isPending,
          onPress: () =>
            remove.mutate(undefined, {
              onSuccess: () => {
                onClose();
                onDeleted();
              },
            }),
        },
      ]}
    />
  );
}
