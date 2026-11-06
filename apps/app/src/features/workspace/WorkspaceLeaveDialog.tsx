import { useRouter } from "expo-router";
import type { Workspace } from "@jc/domain";
import { useAuth } from "@/shared/providers/auth-provider";
import { Modal } from "@/shared/ui/modal";
import { useWorkspaceActions, workspaceErrorMessage } from "./hooks/use-workspaces";

export type WorkspaceLeaveDialogProps = {
  /** `null` = fenêtre fermée. */
  workspace: Workspace | null;
  onClose: () => void;
};

/**
 * Confirmation avant de quitter un espace.
 *
 * Partagée par l'écran de l'espace et le menu « … » de la barre latérale : le
 * départ doit demander la même confirmation d'où qu'on le déclenche.
 */
export function WorkspaceLeaveDialog({ workspace, onClose }: WorkspaceLeaveDialogProps) {
  const router = useRouter();
  const { session } = useAuth();
  const { removeMember } = useWorkspaceActions();
  const selfId = session?.user.id;

  if (!workspace || !selfId) return null;

  return (
    <Modal
      open
      onClose={onClose}
      variant="confirm"
      title={`Quitter « ${workspace.name} » ?`}
      description="Vous perdez l'accès à l'espace et à ses conversations. Seul un admin pourra vous réinviter."
      error={workspaceErrorMessage(
        removeMember.error,
        "Le départ a échoué. Réessayez dans un instant.",
      )}
      actions={[
        { label: "Rester", onPress: onClose, disabled: removeMember.isPending },
        {
          label: "Quitter",
          variant: "destructive",
          disabled: removeMember.isPending,
          onPress: () =>
            removeMember.mutate(
              { workspaceId: workspace.id, userId: selfId },
              {
                onSuccess: () => {
                  onClose();
                  router.replace("/chat");
                },
              },
            ),
        },
      ]}
    />
  );
}
