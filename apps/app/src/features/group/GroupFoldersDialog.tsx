import { useState } from "react";
import { View } from "react-native";
import { Check } from "lucide-react-native";
import type { FolderTreeNode, Group } from "@jc/domain";
import {
  useAssignGroupFolders,
  useWorkspaceFolders,
} from "@/features/workspace/hooks/use-workspace-folders";
import { workspaceErrorMessage } from "@/features/workspace/hooks/use-workspaces";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { Text } from "@/shared/ui/text";

export type GroupFoldersDialogProps = {
  /** `null` = fenêtre fermée. */
  group: Group | null;
  onClose: () => void;
};

/**
 * Ranger une conversation d'espace : on coche plusieurs dossiers, jamais un
 * seul (règle 400-produit, A.1). Les dossiers proposés sont ceux de l'espace.
 */
export function GroupFoldersDialog({ group, onClose }: GroupFoldersDialogProps) {
  if (!group) return null;

  return <FoldersForm key={group.id} group={group} onClose={onClose} />;
}

function FoldersForm({ group, onClose }: { group: Group; onClose: () => void }) {
  const folders = useWorkspaceFolders(group.workspaceId);
  const assign = useAssignGroupFolders(group.id);
  const [selected, setSelected] = useState<string[]>(group.folderIds);

  const toggle = (folderId: string) =>
    setSelected((current) =>
      current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId],
    );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Ranger « ${group.title} »`}
      description="Dans les dossiers de l'espace. Une conversation peut en rejoindre plusieurs."
      error={workspaceErrorMessage(
        assign.error,
        "Le rangement n'a pas pu être enregistré. Réessayez dans un instant.",
      )}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: assign.isPending },
        {
          label: "Enregistrer",
          variant: "default",
          disabled: assign.isPending,
          onPress: () => assign.mutate(selected, { onSuccess: onClose }),
        },
      ]}
    >
      {folders.data && folders.data.length === 0 ? (
        <Text className="text-sm italic text-muted-foreground">
          Aucun dossier dans l'espace pour l'instant. Créez-en un depuis la barre latérale.
        </Text>
      ) : (
        <View className="overflow-hidden rounded-md border border-border">
          <Checklist
            nodes={folders.data ?? []}
            selected={selected}
            onToggle={toggle}
            disabled={assign.isPending}
          />
        </View>
      )}
    </Modal>
  );
}

/** Arborescence cochable — même rangée que le rangement d'une conversation personnelle. */
function Checklist({
  nodes,
  selected,
  onToggle,
  disabled,
}: {
  nodes: FolderTreeNode[];
  selected: string[];
  onToggle: (folderId: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      {nodes.map((node) => {
        const checked = selected.includes(node.id);
        return (
          <View key={node.id}>
            <Button
              variant="ghost"
              onPress={() => onToggle(node.id)}
              disabled={disabled}
              role="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={node.name}
              className="h-11 justify-start gap-3 rounded-none px-3 sm:h-11"
            >
              <View
                className={
                  checked
                    ? "size-5 items-center justify-center rounded border border-primary bg-primary"
                    : "size-5 items-center justify-center rounded border border-border"
                }
              >
                {checked ? <Icon as={Check} size={14} className="text-primary-foreground" /> : null}
              </View>
              <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                {node.name}
              </Text>
            </Button>
            {node.children.length > 0 ? (
              <View className="ml-5 border-l border-border pl-1">
                <Checklist
                  nodes={node.children}
                  selected={selected}
                  onToggle={onToggle}
                  disabled={disabled}
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </>
  );
}
