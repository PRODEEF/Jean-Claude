import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Mail, X } from "lucide-react-native";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import {
  useReceivedInvitations,
  useWorkspaceActions,
  workspaceErrorMessage,
} from "./hooks/use-workspaces";

/**
 * Invitation reçue, sous la bannière de l'application.
 *
 * Elle s'affiche sur tous les écrans : la personne invitée n'a aucune raison
 * d'aller ouvrir le sélecteur d'espace, dont la seule trace est une pastille
 * (docs/COLLABORATION.md §2). « Plus tard » la masque jusqu'au prochain
 * chargement plutôt que de forcer une réponse, car refuser est définitif : seul
 * un admin peut réinviter.
 */
export function InvitationBanner() {
  const router = useRouter();
  const invitations = useReceivedInvitations();
  const { accept, decline } = useWorkspaceActions();
  const [postponed, setPostponed] = useState<string[]>([]);

  const pending = (invitations.data ?? []).filter(({ id }) => !postponed.includes(id));
  const current = pending[0];
  if (!current) return null;

  const others = pending.length - 1;
  const answering = accept.isPending || decline.isPending;
  const error = workspaceErrorMessage(
    accept.error ?? decline.error,
    "La réponse n'a pas pu être envoyée. Réessayez dans un instant.",
  );

  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-muted px-3 py-2">
      <Icon as={Mail} size={16} className="text-foreground" />
      <View className="min-w-0 flex-1 basis-48">
        <Text className="text-sm text-foreground">
          Vous êtes invité dans{" "}
          <Text className="text-sm font-semibold">{current.workspaceName}</Text>
          {others > 0 ? (
            <Text className="text-sm text-muted-foreground">
              {others === 1 ? " (et 1 autre invitation)" : ` (et ${others} autres invitations)`}
            </Text>
          ) : null}
        </Text>
        {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
      </View>
      <View className="flex-row items-center gap-2">
        <Button
          variant="outline"
          disabled={answering}
          onPress={() => decline.mutate(current.id)}
          accessibilityLabel={`Refuser l'invitation dans ${current.workspaceName}`}
        >
          <Text>Refuser</Text>
        </Button>
        <Button
          disabled={answering}
          onPress={() =>
            accept.mutate(current.id, {
              onSuccess: (workspace) => router.push(`/workspace/${workspace.id}`),
            })
          }
          accessibilityLabel={`Rejoindre ${current.workspaceName}`}
        >
          <Text>Rejoindre</Text>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={answering}
          onPress={() => setPostponed((ids) => [...ids, current.id])}
          accessibilityLabel="Répondre plus tard"
        >
          <Icon as={X} size={16} className="text-muted-foreground" />
        </Button>
      </View>
    </View>
  );
}
