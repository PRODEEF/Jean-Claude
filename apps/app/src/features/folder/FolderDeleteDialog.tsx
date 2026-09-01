import type { Folder } from "@jc/domain";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Text } from "@/shared/ui/text";
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
  const { remove } = useFolderActions();

  return (
    <Dialog
      open={folder !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {folder ? (
          <>
            <DialogHeader>
              <DialogTitle>Supprimer « {folder.name} » ?</DialogTitle>
              <DialogDescription>
                Les conversations qu'il contient ne sont pas supprimées : elles perdent seulement ce
                rangement.
              </DialogDescription>
            </DialogHeader>

            {/* Message fixe, et non `error.message` : une erreur remontée du
                serveur peut porter des fragments de requête. */}
            {remove.isError ? (
              <Text className="text-sm text-destructive">
                La suppression a échoué. Réessayez dans un instant.
              </Text>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onPress={onClose} disabled={remove.isPending}>
                <Text>Annuler</Text>
              </Button>
              <Button
                variant="destructive"
                onPress={() => remove.mutate(folder.id, { onSuccess: onClose })}
                disabled={remove.isPending}
              >
                <Text>Supprimer</Text>
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
