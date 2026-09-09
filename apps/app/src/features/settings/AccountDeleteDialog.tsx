import { Modal } from "@/shared/ui/modal";
import { useDeleteAccount } from "@/shared/hooks/use-profile";

export type AccountDeleteDialogProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Confirmation de suppression du compte (§8, §13.4.6).
 *
 * Irréversible et sans délai de grâce : la description le dit explicitement,
 * plutôt que de laisser le seul mot « Supprimer » du bouton porter la mise en
 * garde, comme pour un dossier ou une conversation.
 */
export function AccountDeleteDialog({ open, onClose }: AccountDeleteDialogProps) {
  const deleteAccount = useDeleteAccount();

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="confirm"
      title="Supprimer votre compte ?"
      description="Cette action est irréversible : votre profil, vos conversations, vos dossiers, vos todolistes et votre calendrier seront définitivement supprimés."
      // Message fixe, et non `error.message` : une erreur remontée du serveur
      // peut porter des fragments de requête.
      error={deleteAccount.isError ? "La suppression a échoué. Réessayez dans un instant." : null}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: deleteAccount.isPending },
        {
          label: "Supprimer mon compte",
          variant: "destructive",
          disabled: deleteAccount.isPending,
          onPress: () => deleteAccount.mutate(undefined, { onSuccess: onClose }),
        },
      ]}
    />
  );
}
