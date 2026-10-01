import type { FolderTreeNode, Group } from "@jc/domain";
import { useAssignGroupFolders } from "@/features/workspace/hooks/use-workspace-folders";
import { workspaceErrorMessage } from "@/features/workspace/hooks/use-workspaces";
import { Modal, type ModalAction } from "@/shared/ui/modal";

/** Conversation d'espace lâchée sur un dossier du même espace. */
export type GroupDrop = {
  group: Group;
  folder: FolderTreeNode;
};

export type GroupDropDialogProps = {
  /** `null` = fenêtre fermée. */
  drop: GroupDrop | null;
  onClose: () => void;
};

/**
 * Même question que pour une conversation personnelle : ajouter le dossier, ou
 * n'y laisser que celui-ci. L'espace de la conversation ne change pas.
 */
export function GroupDropDialog({ drop, onClose }: GroupDropDialogProps) {
  if (!drop) return null;

  return <DropChoice key={drop.group.id} drop={drop} onClose={onClose} />;
}

function DropChoice({ drop, onClose }: { drop: GroupDrop; onClose: () => void }) {
  const assign = useAssignGroupFolders(drop.group.id);
  const { group, folder } = drop;
  const filedElsewhere = group.folderIds.some((id) => id !== folder.id);

  const apply = (folderIds: string[]) => assign.mutate(folderIds, { onSuccess: onClose });

  const actions: ModalAction[] = [{ label: "Annuler", onPress: onClose, disabled: assign.isPending }];

  if (filedElsewhere) {
    actions.push({
      label: "Déplacer ici seulement",
      onPress: () => apply([folder.id]),
      disabled: assign.isPending,
    });
  }

  actions.push({
    label: filedElsewhere ? "Ajouter à ce dossier" : "Ranger ici",
    variant: "default",
    onPress: () => apply([...new Set([...group.folderIds, folder.id])]),
    disabled: assign.isPending,
  });

  return (
    <Modal
      open
      onClose={onClose}
      variant="confirm"
      title={`Ranger dans « ${folder.name} » ?`}
      description={
        filedElsewhere
          ? `« ${group.title} » est déjà rangée ailleurs dans cet espace. Elle peut appartenir aux deux dossiers à la fois.`
          : `« ${group.title} » rejoindra ce dossier.`
      }
      error={workspaceErrorMessage(
        assign.error,
        "Le rangement a échoué. Réessayez dans un instant.",
      )}
      actions={actions}
    />
  );
}
