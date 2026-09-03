import type { Conversation } from "@jc/domain";
import { Modal } from "@/shared/ui/modal";
import { useConversationActions } from "./hooks/use-conversation-actions";

export type ConversationDeleteDialogProps = {
  /** `null` = fenêtre fermée. */
  conversation: Conversation | null;
  onClose: () => void;
  /** Appelé après suppression — l'écran ouvert n'a plus de conversation à afficher. */
  onDeleted: (conversation: Conversation) => void;
};

/**
 * Confirmation de suppression d'une conversation.
 *
 * Renommer et ranger se font en ligne ou dans la fenêtre de la conversation ;
 * une suppression, elle, ne se rattrape pas — elle mérite qu'on s'arrête
 * dessus, comme pour un dossier.
 */
export function ConversationDeleteDialog({
  conversation,
  onClose,
  onDeleted,
}: ConversationDeleteDialogProps) {
  if (!conversation) return null;

  return (
    <DeleteConfirmation
      key={conversation.id}
      conversation={conversation}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
}

function DeleteConfirmation({
  conversation,
  onClose,
  onDeleted,
}: {
  conversation: Conversation;
  onClose: () => void;
  onDeleted: (conversation: Conversation) => void;
}) {
  const { remove } = useConversationActions(conversation.id);

  return (
    <Modal
      open
      onClose={onClose}
      variant="confirm"
      title={`Supprimer « ${conversation.title} » ?`}
      description="Les messages de cette conversation seront perdus."
      // Message fixe, et non `error.message` : une erreur remontée du serveur
      // peut porter des fragments de requête.
      error={remove.isError ? "La suppression a échoué. Réessayez dans un instant." : null}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: remove.isPending },
        {
          label: "Supprimer",
          variant: "destructive",
          disabled: remove.isPending,
          onPress: () => remove.mutate(undefined, { onSuccess: () => onDeleted(conversation) }),
        },
      ]}
    />
  );
}
