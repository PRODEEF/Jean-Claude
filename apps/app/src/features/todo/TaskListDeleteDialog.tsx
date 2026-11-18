import type { TaskList } from "@jc/domain";
import { Modal } from "@/shared/ui/modal";
import { useTaskActions } from "@/shared/hooks/use-task-lists";

export type TaskListDeleteDialogProps = {
  /** `null` = fenêtre fermée. */
  list: TaskList | null;
  /**
   * La date de la série sur laquelle on a cliqué, quand elle est connue : sans
   * elle, on ne peut supprimer que toute la série.
   */
  occurrenceAt?: string | undefined;
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
export function TaskListDeleteDialog({ list, occurrenceAt, onClose }: TaskListDeleteDialogProps) {
  if (!list) return null;

  return (
    <DeleteConfirmation
      key={`${list.id}-${occurrenceAt ?? ""}`}
      list={list}
      occurrenceAt={occurrenceAt}
      onClose={onClose}
    />
  );
}

function DeleteConfirmation({
  list,
  occurrenceAt,
  onClose,
}: {
  list: TaskList;
  occurrenceAt: string | undefined;
  onClose: () => void;
}) {
  const { removeList, setOccurrence } = useTaskActions();
  const pending = removeList.isPending || setOccurrence.isPending;
  const failed = removeList.isError || setOccurrence.isError;

  // Une série : « seulement cette date » ou « toute la série » (décision de Yann,
  // 12 novembre). La première n'écrit qu'une exception, la seconde supprime la liste.
  if (list.rrule !== null) {
    return (
      <Modal
        open
        onClose={onClose}
        variant="confirm"
        title={`Supprimer « ${list.title} » ?`}
        description={
          occurrenceAt
            ? "Ce rendez-vous se répète. Supprimer seulement cette date, ou toute la série ?"
            : "Ce rendez-vous se répète. Toute la série sera supprimée, avec ses tâches."
        }
        error={failed ? "La suppression a échoué. Réessayez dans un instant." : null}
        actions={[
          { label: "Annuler", onPress: onClose, disabled: pending },
          ...(occurrenceAt
            ? [
                {
                  label: "Cette date seulement",
                  disabled: pending,
                  onPress: () =>
                    setOccurrence.mutate(
                      { id: list.id, input: { occurrenceAt, cancelled: true } },
                      { onSuccess: onClose },
                    ),
                },
              ]
            : []),
          {
            label: "Toute la série",
            variant: "destructive" as const,
            disabled: pending,
            onPress: () => removeList.mutate(list.id, { onSuccess: onClose }),
          },
        ]}
      />
    );
  }

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
