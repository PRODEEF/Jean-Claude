import { useState } from "react";
import { View } from "react-native";
import { WORKSPACE_NAME_MAX_LENGTH, type Workspace } from "@jc/domain";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Text } from "@/shared/ui/text";
import { useWorkspaceActions, workspaceErrorMessage } from "./hooks/use-workspaces";

/** `create` — un nouvel espace ; `rename` — celui qu'on renomme. */
export type WorkspaceNameTarget = { kind: "create" } | { kind: "rename"; workspace: Workspace };

export type WorkspaceNameDialogProps = {
  /** `null` = fenêtre fermée. */
  target: WorkspaceNameTarget | null;
  onClose: () => void;
  /** Appelé avec l'espace créé ou renommé. */
  onDone: (workspace: Workspace) => void;
};

export function WorkspaceNameDialog({ target, onClose, onDone }: WorkspaceNameDialogProps) {
  if (!target) return null;

  // La clé remet le champ à zéro d'une ouverture à l'autre.
  return (
    <NameForm
      key={target.kind === "rename" ? target.workspace.id : "create"}
      target={target}
      onClose={onClose}
      onDone={onDone}
    />
  );
}

function NameForm({
  target,
  onClose,
  onDone,
}: {
  target: WorkspaceNameTarget;
  onClose: () => void;
  onDone: (workspace: Workspace) => void;
}) {
  const { create, rename } = useWorkspaceActions();
  const [name, setName] = useState(target.kind === "rename" ? target.workspace.name : "");
  const mutation = target.kind === "create" ? create : rename;
  const trimmed = name.trim();

  const submit = () => {
    if (!trimmed || mutation.isPending) return;
    if (target.kind === "create") {
      create.mutate(trimmed, { onSuccess: onDone });
    } else {
      rename.mutate({ id: target.workspace.id, name: trimmed }, { onSuccess: onDone });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={target.kind === "create" ? "Nouvel espace" : "Renommer l'espace"}
      {...(target.kind === "create"
        ? {
            description:
              "Un espace réunit les personnes avec qui vous travaillez : une association, une équipe.",
          }
        : {})}
      error={workspaceErrorMessage(
        mutation.error,
        "L'enregistrement a échoué. Réessayez dans un instant.",
      )}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: mutation.isPending },
        {
          label: target.kind === "create" ? "Créer" : "Renommer",
          variant: "default",
          onPress: submit,
          disabled: !trimmed || mutation.isPending,
        },
      ]}
    >
      <View className="gap-2">
        <Text className="text-sm font-medium">Nom de l'espace</Text>
        <Input
          value={name}
          onChangeText={setName}
          onSubmitEditing={submit}
          placeholder="Association des parents d'élèves"
          maxLength={WORKSPACE_NAME_MAX_LENGTH}
          autoFocus
          returnKeyType="done"
          accessibilityLabel="Nom de l'espace"
        />
      </View>
    </Modal>
  );
}
