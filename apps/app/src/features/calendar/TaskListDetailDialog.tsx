import { useState } from "react";
import { useRouter } from "expo-router";
import { Pencil, Trash2 } from "lucide-react-native";
import type { TaskList, TaskListWithTasks } from "@jc/domain";
import { ApiError } from "@jc/api-client";
import { Modal } from "@/shared/ui/modal";
import { useTaskActions } from "@/shared/hooks/use-task-lists";
import { openTaskCount } from "@/shared/lib/tasks";
import { remainingLabel } from "./DayAgenda";

export type TaskListDetailDialogProps = {
  /** `null` = fenêtre fermée. */
  list: TaskListWithTasks | null;
  onClose: () => void;
  /** Ouvre le formulaire de modification complet — un pas de plus, jamais le premier. */
  onEdit: (list: TaskList) => void;
};

/**
 * Détail d'une todoliste échue, au clic depuis l'agenda du jour — même geste
 * que pour un événement (§4.2) : les tâches elles-mêmes se cochent dans
 * l'onglet Mes listes, qui reste leur seul écran.
 */
export function TaskListDetailDialog({ list, onClose, onEdit }: TaskListDetailDialogProps) {
  if (!list) return null;
  return <Detail key={list.id} list={list} onClose={onClose} onEdit={onEdit} />;
}

function Detail({
  list,
  onClose,
  onEdit,
}: {
  list: TaskListWithTasks;
  onClose: () => void;
  onEdit: (list: TaskList) => void;
}) {
  const router = useRouter();
  const { removeList } = useTaskActions();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (confirmingDelete) {
    return (
      <Modal
        open
        onClose={onClose}
        variant="confirm"
        title={`Supprimer « ${list.title} » ?`}
        description="Les tâches de cette liste seront supprimées avec elle."
        error={error}
        actions={[
          {
            label: "Annuler",
            onPress: () => setConfirmingDelete(false),
            disabled: removeList.isPending,
          },
          {
            label: "Supprimer",
            variant: "destructive",
            disabled: removeList.isPending,
            onPress: () =>
              removeList.mutate(list.id, {
                onSuccess: onClose,
                onError: (cause) => setError(toMessage(cause)),
              }),
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
      title={list.title}
      description={remainingLabel(openTaskCount(list))}
      headerActions={[
        {
          icon: Trash2,
          label: "Supprimer la liste",
          destructive: true,
          onPress: () => setConfirmingDelete(true),
        },
        { icon: Pencil, label: "Modifier la liste", onPress: () => onEdit(list) },
      ]}
      actions={[
        {
          label: "Ouvrir la liste",
          variant: "default",
          onPress: () => {
            onClose();
            router.push(`/todo?list=${list.id}` as never);
          },
        },
      ]}
    />
  );
}

/**
 * Un 400 vient de nos propres règles et porte un message écrit pour
 * l'utilisateur. Tout le reste est remplacé : une panne technique peut
 * transporter des fragments de requête.
 */
function toMessage(cause: Error): string {
  if (cause instanceof ApiError && cause.status === 400) return cause.message;
  return "La suppression a échoué. Réessayez dans un instant.";
}
