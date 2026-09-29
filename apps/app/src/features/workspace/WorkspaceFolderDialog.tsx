import { useState } from "react";
import { View } from "react-native";
import type { Folder } from "@jc/domain";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Text } from "@/shared/ui/text";
import { workspaceErrorMessage } from "./hooks/use-workspaces";
import { useWorkspaceFolderActions } from "./hooks/use-workspace-folders";

/** Ce que la fenêtre s'apprête à faire d'un dossier de l'espace. */
export type WorkspaceFolderTarget =
  | { kind: "create"; parentId: string | null }
  | { kind: "rename"; folder: Folder }
  | { kind: "delete"; folder: Folder };

export type WorkspaceFolderDialogProps = {
  workspaceId: string;
  /** `null` = fenêtre fermée. */
  target: WorkspaceFolderTarget | null;
  onClose: () => void;
};

export function WorkspaceFolderDialog({
  workspaceId,
  target,
  onClose,
}: WorkspaceFolderDialogProps) {
  if (!target) return null;

  if (target.kind === "delete") {
    return (
      <DeleteConfirmation workspaceId={workspaceId} folder={target.folder} onClose={onClose} />
    );
  }

  return (
    <NameForm
      key={target.kind === "rename" ? target.folder.id : `create-${target.parentId ?? "racine"}`}
      workspaceId={workspaceId}
      target={target}
      onClose={onClose}
    />
  );
}

function NameForm({
  workspaceId,
  target,
  onClose,
}: {
  workspaceId: string;
  target: Exclude<WorkspaceFolderTarget, { kind: "delete" }>;
  onClose: () => void;
}) {
  const { create, rename } = useWorkspaceFolderActions(workspaceId);
  const [name, setName] = useState(target.kind === "rename" ? target.folder.name : "");
  const mutation = target.kind === "create" ? create : rename;
  const trimmed = name.trim();

  const submit = () => {
    if (!trimmed || mutation.isPending) return;
    if (target.kind === "create") {
      create.mutate({ name: trimmed, parentId: target.parentId }, { onSuccess: onClose });
    } else {
      rename.mutate({ id: target.folder.id, name: trimmed }, { onSuccess: onClose });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={
        target.kind === "rename"
          ? "Renommer le dossier"
          : target.parentId
            ? "Nouveau sous-dossier"
            : "Nouveau dossier"
      }
      description="Visible de tous les membres de l'espace."
      error={workspaceErrorMessage(
        mutation.error,
        "L'enregistrement a échoué. Réessayez dans un instant.",
      )}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: mutation.isPending },
        {
          label: target.kind === "rename" ? "Renommer" : "Créer",
          variant: "default",
          onPress: submit,
          disabled: !trimmed || mutation.isPending,
        },
      ]}
    >
      <View className="gap-2">
        <Text className="text-sm font-medium">Nom du dossier</Text>
        <Input
          value={name}
          onChangeText={setName}
          onSubmitEditing={submit}
          placeholder="Kermesse, Comptabilité, Adhésions…"
          maxLength={120}
          autoFocus
          returnKeyType="done"
          accessibilityLabel="Nom du dossier"
        />
      </View>
    </Modal>
  );
}

function DeleteConfirmation({
  workspaceId,
  folder,
  onClose,
}: {
  workspaceId: string;
  folder: Folder;
  onClose: () => void;
}) {
  const { remove } = useWorkspaceFolderActions(workspaceId);

  return (
    <Modal
      open
      onClose={onClose}
      variant="confirm"
      title={`Supprimer « ${folder.name} » ?`}
      description="Pour tous les membres. Ses sous-dossiers disparaissent avec lui ; les conversations qu'il contient restent, seul ce rangement est perdu."
      error={remove.isError ? "La suppression a échoué. Réessayez dans un instant." : null}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: remove.isPending },
        {
          label: "Supprimer",
          variant: "destructive",
          disabled: remove.isPending,
          onPress: () => remove.mutate(folder.id, { onSuccess: onClose }),
        },
      ]}
    />
  );
}
