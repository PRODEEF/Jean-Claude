import type { TaskList } from "@jc/domain";
import { Modal } from "@/shared/ui/modal";
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
  if (!list) return null;

  return <DeleteConfirmation key={list.id} list={list} onClose={onClose} />;
}

function DeleteConfirmation({ list, onClose }: { list: TaskList; onClose: () => void }) {
  const { removeList } = useTaskActions();

  return (
    <Modal
      open
      onClose={onClose}
      variant="confirm"
      title={`Supprimer « ${list.title} » ?`}
      description="Les tâches de cette liste seront supprimées avec elle."
      // Message fixe, et non `error.message` : une erreur remontée du serveur
      // peut porter des fragments de requête.
      error={removeList.isError ? "La suppression a échoué. Réessayez dans un instant." : null}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: removeList.isPending },
        {
          label: "Supprimer",
          variant: "destructive",
          disabled: removeList.isPending,
          onPress: () => removeList.mutate(list.id, { onSuccess: onClose }),
        },
      ]}
    />
  );
}
