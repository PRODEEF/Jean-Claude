import type { Conversation } from "@jc/domain";
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
  return (
    <Dialog
      open={conversation !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {conversation ? (
          <DeleteForm
            key={conversation.id}
            conversation={conversation}
            onClose={onClose}
            onDeleted={onDeleted}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DeleteForm({
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
    <>
      <DialogHeader>
        <DialogTitle>Supprimer « {conversation.title} » ?</DialogTitle>
        <DialogDescription>Les messages de cette conversation seront perdus.</DialogDescription>
      </DialogHeader>

      {/* Message fixe, et non `error.message` : une erreur remontée du serveur
          peut porter des fragments de requête. */}
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
          onPress={() => remove.mutate(undefined, { onSuccess: () => onDeleted(conversation) })}
          disabled={remove.isPending}
        >
          <Text>Supprimer</Text>
        </Button>
      </DialogFooter>
    </>
  );
}
