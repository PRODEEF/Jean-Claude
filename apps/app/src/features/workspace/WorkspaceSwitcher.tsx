import { useState } from "react";
import { Pressable, View } from "react-native";
import { Check, ChevronsUpDown, User, Users } from "lucide-react-native";
import type { Workspace } from "@jc/domain";
import { cn } from "@/shared/lib/utils";
import { useTheme } from "@/shared/providers/theme-provider";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { Text } from "@/shared/ui/text";
import { rememberWorkspace } from "./hooks/use-active-workspace";
import {
  useReceivedInvitations,
  useWorkspaceActions,
  useWorkspaces,
  workspaceErrorMessage,
} from "./hooks/use-workspaces";
import { WorkspaceNameDialog } from "./WorkspaceNameDialog";

export type WorkspaceSwitcherProps = {
  /** Espace affiché, `null` pour l'espace personnel. */
  activeWorkspaceId: string | null;
  onNavigate: (href: string) => void;
};

/**
 * Sélecteur d'espace, en tête de la barre latérale.
 *
 * Placement et forme repris de Slack, Notion et ChatGPT Team (§4.2) : le nom
 * de l'espace courant, un chevron, et au clic la liste des espaces avec de
 * quoi en créer un. Les invitations en attente s'y lisent aussi — c'est là
 * qu'on cherche un espace qu'on n'a pas encore rejoint.
 */
export function WorkspaceSwitcher({ activeWorkspaceId, onNavigate }: WorkspaceSwitcherProps) {
  const workspaces = useWorkspaces();
  const invitations = useReceivedInvitations();
  const [open, setOpen] = useState<"list" | "create" | null>(null);

  const active = workspaces.data?.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const pending = (invitations.data ?? []).filter((invitation) => invitation.status === "pending").length;

  const go = (href: string) => {
    setOpen(null);
    onNavigate(href);
  };

  return (
    <>
      <Button
        variant="ghost"
        onPress={() => setOpen("list")}
        accessibilityLabel={
          pending > 0
            ? `Changer d'espace — ${pending} invitation(s) en attente`
            : "Changer d'espace"
        }
        className="h-auto justify-start gap-3 px-2 py-2"
      >
        <SpaceIcon workspace={active} />
        <Text className="flex-1 text-sm font-semibold text-foreground" numberOfLines={1}>
          {active?.name ?? "Personnel"}
        </Text>
        {pending > 0 ? <View className="size-2 rounded-full bg-destructive" /> : null}
        <Icon as={ChevronsUpDown} size={14} className="text-muted-foreground" />
      </Button>

      <SpaceList
        open={open === "list"}
        activeWorkspaceId={activeWorkspaceId}
        onClose={() => setOpen(null)}
        onCreate={() => setOpen("create")}
        onNavigate={go}
      />

      <WorkspaceNameDialog
        target={open === "create" ? { kind: "create" } : null}
        onClose={() => setOpen(null)}
        onDone={(workspace) => go(`/workspace/${workspace.id}`)}
      />
    </>
  );
}

function SpaceList({
  open,
  activeWorkspaceId,
  onClose,
  onCreate,
  onNavigate,
}: {
  open: boolean;
  activeWorkspaceId: string | null;
  onClose: () => void;
  onCreate: () => void;
  onNavigate: (href: string) => void;
}) {
  const workspaces = useWorkspaces();
  const invitations = useReceivedInvitations();
  const { accept, decline } = useWorkspaceActions();
  const { palette } = useTheme();
  const answering = accept.isPending || decline.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mes espaces"
      error={
        workspaces.error || invitations.error
          ? "Les espaces n'ont pas pu être chargés. Réessayez dans un instant."
          : workspaceErrorMessage(
              accept.error ?? decline.error,
              "La réponse n'a pas pu être envoyée. Réessayez dans un instant.",
            )
      }
      actions={[{ label: "Nouvel espace", variant: "default", onPress: onCreate }]}
    >
      <View className="gap-1">
        <SpaceRow
          workspace={null}
          active={activeWorkspaceId === null}
          onPress={() => {
            // Le choix explicite du personnel : l'adresse `/chat` ne dit rien
            // de l'espace, c'est la mémoire qui doit le refléter.
            rememberWorkspace(null);
            onNavigate("/chat");
          }}
        />
        {workspaces.data?.map((workspace) => (
          <SpaceRow
            key={workspace.id}
            workspace={workspace}
            active={workspace.id === activeWorkspaceId}
            onPress={() => onNavigate(`/workspace/${workspace.id}`)}
          />
        ))}
      </View>

      {(invitations.data ?? []).some((invitation) => invitation.status === "pending") ? (
        <View className="gap-2">
          <Text className="text-xs font-medium uppercase text-muted-foreground">Invitations</Text>
          {(invitations.data ?? [])
            .filter((invitation) => invitation.status === "pending")
            .map((invitation) => (
            <View key={invitation.id} className="gap-3 rounded-lg border border-border px-3 py-3">
              <Text className="text-sm">
                Vous êtes invité dans{" "}
                <Text className="text-sm font-semibold">{invitation.workspaceName}</Text>
              </Text>
              <View className="flex-row justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={answering}
                  onPress={() => decline.mutate(invitation.id)}
                  accessibilityLabel={`Refuser l'invitation dans ${invitation.workspaceName}`}
                >
                  <Text>Refuser</Text>
                </Button>
                {/* Peint depuis la palette comme le bouton principal de `Modal` :
                    le portail de la fenêtre n'hérite pas toujours des variables
                    CSS qui portent `bg-primary`. */}
                <Button
                  disabled={answering}
                  style={{ backgroundColor: palette.accent }}
                  onPress={() =>
                    accept.mutate(invitation.id, {
                      onSuccess: (workspace) => onNavigate(`/workspace/${workspace.id}`),
                    })
                  }
                  accessibilityLabel={`Rejoindre ${invitation.workspaceName}`}
                >
                  <Text style={{ color: palette.accentText }}>Rejoindre</Text>
                </Button>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Modal>
  );
}

function SpaceRow({
  workspace,
  active,
  onPress,
}: {
  workspace: Workspace | null;
  active: boolean;
  onPress: () => void;
}) {
  const name = workspace?.name ?? "Personnel";

  return (
    <View className={cn("flex-row items-center rounded-md", active && "bg-muted")}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Ouvrir ${name}`}
        accessibilityState={{ selected: active }}
        className="min-h-11 min-w-0 flex-1 flex-row items-center gap-3 rounded-md px-2 py-2 active:bg-muted"
      >
        <SpaceIcon workspace={workspace} />
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium" numberOfLines={1}>
            {name}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {workspace
              ? `Espace collaboratif · ${workspace.memberCount} ${workspace.memberCount > 1 ? "membres" : "membre"}`
              : "Vos conversations, listes et calendrier"}
          </Text>
        </View>
        {active ? <Icon as={Check} size={16} className="text-foreground" /> : null}
      </Pressable>
    </View>
  );
}

/** Pastille de l'espace : une silhouette pour le personnel, un groupe pour une équipe. */
function SpaceIcon({ workspace }: { workspace: Workspace | null }) {
  return (
    <View className="size-8 items-center justify-center rounded-md bg-muted">
      <Icon as={workspace ? Users : User} size={16} className="text-foreground" />
    </View>
  );
}
