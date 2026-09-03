import type { TaskList } from "@jc/domain";
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
import { useTaskActions } from "@/shared/hooks/use-task-lists";

export type TaskListDeleteDialogProps = {
  /** `null` = fenêtre fermée. */
  list: TaskList | null;
  onClose: () => void;
};

/**
 * Confirmation de suppression d'une todoliste.
 *
 * Une fenêtre plutôt qu'un second appui sur l'entrée du menu : le menu se
 * referme dès qu'on choisit, il n'y a nulle part où afficher un état
 * intermédiaire. Et supprimer une liste emporte ses tâches — c'est ce qu'il
 * faut dire avant, pas découvrir après.
 */
export function TaskListDeleteDialog({ list, onClose }: TaskListDeleteDialogProps) {
  const { removeList } = useTaskActions();

  return (
    <Dialog
      open={list !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {list ? (
          <>
            <DialogHeader>
              <DialogTitle>Supprimer « {list.title} » ?</DialogTitle>
              <DialogDescription>
                Les tâches de cette liste seront supprimées avec elle.
              </DialogDescription>
            </DialogHeader>

            {/* Message fixe, et non `error.message` : une erreur remontée du
                serveur peut porter des fragments de requête. */}
            {removeList.isError ? (
              <Text className="text-destructive text-sm">
                La suppression a échoué. Réessayez dans un instant.
              </Text>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onPress={onClose} disabled={removeList.isPending}>
                <Text>Annuler</Text>
              </Button>
              <Button
                variant="destructive"
                onPress={() => removeList.mutate(list.id, { onSuccess: onClose })}
                disabled={removeList.isPending}
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
