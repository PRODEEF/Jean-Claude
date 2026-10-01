import { View } from "react-native";
import { useRouter } from "expo-router";
import type { ReceivedInvitation } from "@jc/domain";
import { useTheme } from "@/shared/providers/theme-provider";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { Text } from "@/shared/ui/text";
import {
  useReceivedInvitations,
  useWorkspaceActions,
  workspaceErrorMessage,
} from "./hooks/use-workspaces";

export type InvitationsDialogProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Invitations reçues, en attente et déjà répondues.
 *
 * La pastille de la barre ne compte que l'attente. L'historique reste ici :
 * un refus ou une acceptation ne disparaît pas de la liste.
 */
export function InvitationsDialog({ open, onClose }: InvitationsDialogProps) {
  const router = useRouter();
  const { palette } = useTheme();
  const invitations = useReceivedInvitations();
  const { accept, decline } = useWorkspaceActions();

  if (!open) return null;

  const items = invitations.data ?? [];
  const pending = items.filter((invitation) => invitation.status === "pending");
  const history = items.filter((invitation) => invitation.status !== "pending");
  const answering = accept.isPending || decline.isPending;
  const error = workspaceErrorMessage(
    accept.error ?? decline.error,
    "La réponse n'a pas pu être envoyée. Réessayez dans un instant.",
  );

  const acceptInvitation = (invitation: ReceivedInvitation) => {
    accept.mutate(invitation.id, {
      onSuccess: (workspace) => {
        onClose();
        router.push(`/workspace/${workspace.id}`);
      },
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Notifications"
      description="Retrouvez ici les invitations et notifications de vos espaces collaboratifs."
      error={error}
      actions={[{ label: "Fermer", onPress: onClose }]}
    >
      {invitations.isError ? (
        <Text className="text-sm text-destructive">
          Les invitations sont indisponibles pour le moment.
        </Text>
      ) : null}

      {!invitations.isError && items.length === 0 ? (
        <Text className="text-sm italic text-muted-foreground">Aucune invitation pour l'instant.</Text>
      ) : null}

      {pending.map((invitation) => (
        <View key={invitation.id} className="gap-3 rounded-lg border border-border px-3 py-3">
          <View className="gap-0.5">
            <Text className="text-sm font-semibold">{invitation.workspaceName}</Text>
            <Text className="text-xs text-muted-foreground">
              En attente · {formatWhen(invitation.createdAt)}
            </Text>
          </View>
          <View className="flex-row justify-end gap-2">
            <Button
              variant="outline"
              disabled={answering}
              onPress={() => decline.mutate(invitation.id)}
              accessibilityLabel={`Refuser l'invitation dans ${invitation.workspaceName}`}
            >
              <Text>Refuser</Text>
            </Button>
            <Button
              disabled={answering}
              style={{ backgroundColor: palette.accent }}
              onPress={() => acceptInvitation(invitation)}
              accessibilityLabel={`Rejoindre ${invitation.workspaceName}`}
            >
              <Text style={{ color: palette.accentText }}>Rejoindre</Text>
            </Button>
          </View>
        </View>
      ))}

      {history.map((invitation) => (
        <View key={invitation.id} className="gap-0.5 rounded-lg border border-border px-3 py-3">
          <Text className="text-sm font-semibold">{invitation.workspaceName}</Text>
          <Text className="text-xs text-muted-foreground">
            {invitation.status === "accepted" ? "Rejoint" : "Refusée"}
            {invitation.answeredAt ? ` · ${formatWhen(invitation.answeredAt)}` : ""}
          </Text>
        </View>
      ))}
    </Modal>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
