import type { Folder } from "@jc/domain";
import { Modal } from "@/shared/ui/modal";
import { useFolderActions } from "./hooks/use-folder-actions";

export type FolderDeleteDialogProps = {
  /** `null` = fenêtre fermée. */
  folder: Folder | null;
  onClose: () => void;
};

/**
 * Confirmation de suppression d'un dossier.
 *
 * Seule action de dossier à passer encore par une fenêtre : renommer et créer
 * se font en ligne dans la barre latérale, mais une suppression ne se rattrape
 * pas — elle mérite qu'on s'arrête dessus.
 */
export function FolderDeleteDialog({ folder, onClose }: FolderDeleteDialogProps) {
  if (!folder) return null;

  return <DeleteConfirmation key={folder.id} folder={folder} onClose={onClose} />;
}

function DeleteConfirmation({ folder, onClose }: { folder: Folder; onClose: () => void }) {
  const { remove } = useFolderActions();

  return (
    <Modal
      open
      onClose={onClose}
      variant="confirm"
      title={`Supprimer « ${folder.name} » ?`}
      description="Les conversations qu'il contient ne sont pas supprimées : elles perdent seulement ce rangement."
      // Message fixe, et non `error.message` : une erreur remontée du serveur
      // peut porter des fragments de requête.
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
