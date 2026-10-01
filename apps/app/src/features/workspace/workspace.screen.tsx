import { Fragment, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Check, Copy, MoreHorizontal } from "lucide-react-native";
import type { Workspace, WorkspaceInvitation, WorkspaceMember } from "@jc/domain";
import { CreateGroupDialog } from "@/features/group/CreateGroupDialog";
import { useGroups } from "@/features/group/hooks/use-groups";
import { useAuth } from "@/shared/providers/auth-provider";
import { useTheme } from "@/shared/providers/theme-provider";
import { Button } from "@/shared/ui/button";
import { ContextMenu, type ContextMenuItem } from "@/shared/ui/context-menu";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { FORM_MAX_WIDTH, ScreenShell } from "@/shared/ui/screen-shell";
import { Separator } from "@/shared/ui/separator";
import { Text } from "@/shared/ui/text";
import {
  useWorkspaceActions,
  useWorkspaceInvitations,
  useWorkspaceMembers,
  useWorkspaces,
  workspaceErrorMessage,
} from "./hooks/use-workspaces";
import { invitationMessage } from "./invitation-message";
import { WorkspaceNameDialog } from "./WorkspaceNameDialog";

/**
 * Un espace d'équipe : ses membres, et pour un admin les invitations.
 *
 * Les discussions de groupe s'ouvrent depuis la barre latérale.
 * Les droits sont vérifiés par le serveur ; l'écran ne fait que masquer les
 * gestes qu'un simple membre n'a pas.
 */
export function WorkspaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const workspaces = useWorkspaces();
  const workspace = workspaces.data?.find((candidate) => candidate.id === id) ?? null;
  const [renaming, setRenaming] = useState(false);

  if (workspaces.isLoading) {
    return (
      <ScreenShell title="">
        <ActivityIndicator color={palette.accent} />
      </ScreenShell>
    );
  }

  if (!workspace) {
    return (
      <ScreenShell title="Espace introuvable" maxWidth={FORM_MAX_WIDTH}>
        <Text className="text-sm text-muted-foreground">
          {workspaces.error
            ? "Les espaces n'ont pas pu être chargés. Réessayez dans un instant."
            : "Cet espace n'existe pas, ou vous n'en faites plus partie."}
        </Text>
      </ScreenShell>
    );
  }

  const isAdmin = workspace.role === "admin";

  return (
    <ScreenShell
      title={workspace.name}
      maxWidth={FORM_MAX_WIDTH}
      action={
        isAdmin ? (
          <Button variant="outline" onPress={() => setRenaming(true)}>
            <Text>Renommer</Text>
          </Button>
        ) : undefined
      }
    >
      <View className="gap-8 pb-8">
        <GettingStarted workspace={workspace} />
        <MembersSection workspace={workspace} />
        {isAdmin ? <InvitationsSection workspace={workspace} /> : null}
        <LeaveSection workspace={workspace} />
      </View>

      <WorkspaceNameDialog
        target={renaming ? { kind: "rename", workspace } : null}
        onClose={() => setRenaming(false)}
        onDone={() => setRenaming(false)}
      />
    </ScreenShell>
  );
}

/**
 * Les étapes d'un espace neuf, tant qu'il n'a aucune conversation.
 *
 * L'invitation ne s'accepte que plus tard, hors de l'application. La
 * conversation, elle, peut démarrer seul : inutile d'attendre une réponse.
 * Un simple membre n'invite personne, il n'a donc que la dernière étape.
 */
function GettingStarted({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  const isAdmin = workspace.role === "admin";
  const groups = useGroups(workspace.id);
  const members = useWorkspaceMembers(workspace.id);
  const invitations = useWorkspaceInvitations(workspace.id, isAdmin);
  const [creating, setCreating] = useState(false);

  // Rien à afficher tant qu'on ignore si des conversations existent.
  if (!groups.data || groups.data.length > 0) return null;

  const joined = (members.data?.length ?? 0) > 1;
  const invited = joined || (invitations.data?.length ?? 0) > 0;

  return (
    <View className="gap-3 rounded-xl border border-border bg-card px-4 py-4">
      <SectionTitle>Pour démarrer</SectionTitle>
      <View className="gap-3">
        {isAdmin ? (
          <>
            <Step
              done={invited}
              title="Invitez une personne"
              detail="Saisissez son adresse dans « Inviter », puis copiez le message pour le lui envoyer."
            />
            <Step
              done={joined}
              title="Elle rejoint l'espace"
              detail="Elle voit l'invitation en se connectant avec cette adresse."
            />
          </>
        ) : null}
        <Step
          done={false}
          title="Lancez la première conversation"
          detail="Vous pouvez la démarrer seul. Jean-Claude s'y joint."
        />
      </View>
      <View className="items-start">
        <Button onPress={() => setCreating(true)}>
          <Text>Démarrer une conversation</Text>
        </Button>
      </View>

      <CreateGroupDialog
        workspaceId={creating ? workspace.id : null}
        onClose={() => setCreating(false)}
        onCreated={(group) => {
          setCreating(false);
          router.push(`/workspace/${workspace.id}/group/${group.id}`);
        }}
      />
    </View>
  );
}

function Step({ done, title, detail }: { done: boolean; title: string; detail: string }) {
  return (
    <View className="flex-row items-start gap-3">
      <View
        className={
          done
            ? "mt-0.5 size-5 items-center justify-center rounded-full bg-primary"
            : "mt-0.5 size-5 items-center justify-center rounded-full border border-border"
        }
      >
        {done ? <Icon as={Check} size={12} className="text-primary-foreground" /> : null}
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-sm font-medium">{title}</Text>
        <Text className="text-xs text-muted-foreground">{detail}</Text>
      </View>
    </View>
  );
}

/** Menu d'un membre, ouvert au point du clic. */
type MemberMenu = { member: WorkspaceMember; x: number; y: number };

function MembersSection({ workspace }: { workspace: Workspace }) {
  const { session } = useAuth();
  const members = useWorkspaceMembers(workspace.id);
  const { changeRole, removeMember } = useWorkspaceActions();
  const [menu, setMenu] = useState<MemberMenu | null>(null);
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null);
  const isAdmin = workspace.role === "admin";
  const selfId = session?.user.id;

  const menuItems = (member: WorkspaceMember): ContextMenuItem[] => [
    {
      label: member.role === "admin" ? "Retirer le rôle d'admin" : "Nommer admin",
      onPress: () => {
        setMenu(null);
        changeRole.mutate({
          workspaceId: workspace.id,
          userId: member.userId,
          role: member.role === "admin" ? "member" : "admin",
        });
      },
    },
    // On se retire soi-même par « Quitter l'espace », en bas de l'écran.
    ...(member.userId === selfId
      ? []
      : [
          {
            label: "Retirer de l'espace",
            destructive: true,
            onPress: () => {
              setMenu(null);
              setRemoving(member);
            },
          },
        ]),
  ];

  const roleError = workspaceErrorMessage(
    changeRole.error,
    "Le rôle n'a pas pu être changé. Réessayez dans un instant.",
  );

  return (
    <View className="gap-3">
      <SectionTitle>Membres</SectionTitle>

      {members.isLoading ? <ActivityIndicator /> : null}
      {members.error ? (
        <Text className="text-sm text-destructive">
          Les membres n'ont pas pu être chargés. Réessayez dans un instant.
        </Text>
      ) : null}
      {roleError ? <Text className="text-sm text-destructive">{roleError}</Text> : null}

      {members.data ? (
        <View className="overflow-hidden rounded-xl border border-border bg-card">
          {members.data.map((member, index) => (
            <Fragment key={member.userId}>
              {index > 0 ? <Separator /> : null}
              <MemberRow
                member={member}
                isSelf={member.userId === selfId}
                {...(isAdmin
                  ? { onMenu: (x: number, y: number) => setMenu({ member, x, y }) }
                  : {})}
              />
            </Fragment>
          ))}
        </View>
      ) : null}

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.member)}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {removing ? (
        <Modal
          open
          onClose={() => setRemoving(null)}
          variant="confirm"
          title={`Retirer ${memberName(removing)} de l'espace ?`}
          description="Cette personne perd l'accès à l'espace et à ses conversations. Ses messages restent."
          error={workspaceErrorMessage(
            removeMember.error,
            "Le retrait a échoué. Réessayez dans un instant.",
          )}
          actions={[
            {
              label: "Annuler",
              onPress: () => setRemoving(null),
              disabled: removeMember.isPending,
            },
            {
              label: "Retirer",
              variant: "destructive",
              disabled: removeMember.isPending,
              onPress: () =>
                removeMember.mutate(
                  { workspaceId: workspace.id, userId: removing.userId },
                  { onSuccess: () => setRemoving(null) },
                ),
            },
          ]}
        />
      ) : null}
    </View>
  );
}

function MemberRow({
  member,
  isSelf,
  onMenu,
}: {
  member: WorkspaceMember;
  isSelf: boolean;
  /** Absent pour un simple membre : il n'a aucun geste sur les autres. */
  onMenu?: (x: number, y: number) => void;
}) {
  const details = [
    member.displayName ? member.email : null,
    member.role === "admin" ? "Admin" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View className="min-h-14 flex-row items-center gap-3 px-4 py-3">
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-medium" numberOfLines={1}>
          {memberName(member)}
          {isSelf ? (
            <Text className="text-sm font-normal text-muted-foreground"> (vous)</Text>
          ) : null}
        </Text>
        {details ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {details}
          </Text>
        ) : null}
      </View>

      {onMenu ? (
        <Button
          variant="ghost"
          size="icon"
          onPress={(event) => onMenu(event.nativeEvent.pageX, event.nativeEvent.pageY)}
          accessibilityLabel={`Actions pour ${memberName(member)}`}
        >
          <Icon as={MoreHorizontal} size={16} className="text-muted-foreground" />
        </Button>
      ) : null}
    </View>
  );
}

function InvitationsSection({ workspace }: { workspace: Workspace }) {
  const workspaceId = workspace.id;
  const invitations = useWorkspaceInvitations(workspaceId, true);
  const { invite, revoke } = useWorkspaceActions();
  const [email, setEmail] = useState("");
  const trimmed = email.trim();

  const submit = () => {
    if (!trimmed || invite.isPending) return;
    invite.mutate({ workspaceId, email: trimmed }, { onSuccess: () => setEmail("") });
  };

  const error =
    workspaceErrorMessage(invite.error, "L'invitation n'a pas pu être envoyée.") ??
    workspaceErrorMessage(revoke.error, "L'invitation n'a pas pu être annulée.");

  return (
    <View className="gap-3">
      <SectionTitle>Inviter</SectionTitle>
      <Text className="text-sm text-muted-foreground">
        Aucun e-mail n'est envoyé : copiez le message d'invitation et envoyez-le vous-même. La
        personne verra l'invitation en se connectant avec cette adresse.
      </Text>

      <View className="flex-row items-center gap-2">
        <Input
          className="flex-1"
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={submit}
          placeholder="adresse@exemple.fr"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          accessibilityLabel="Adresse e-mail à inviter"
        />
        <Button onPress={submit} disabled={!trimmed || invite.isPending}>
          <Text>Inviter</Text>
        </Button>
      </View>

      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}

      {invitations.data && invitations.data.length > 0 ? (
        <View className="overflow-hidden rounded-xl border border-border bg-card">
          {invitations.data.map((invitation, index) => (
            <Fragment key={invitation.id}>
              {index > 0 ? <Separator /> : null}
              <InvitationRow
                invitation={invitation}
                workspaceName={workspace.name}
                disabled={revoke.isPending}
                onRevoke={() => revoke.mutate({ workspaceId, invitationId: invitation.id })}
              />
            </Fragment>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function InvitationRow({
  invitation,
  workspaceName,
  disabled,
  onRevoke,
}: {
  invitation: WorkspaceInvitation;
  workspaceName: string;
  disabled: boolean;
  onRevoke: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    Clipboard.setStringAsync(invitationMessage(workspaceName, invitation.email))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2_000);
      })
      .catch((error: unknown) => {
        // Le navigateur peut refuser l'accès au presse-papier : rien à dire à
        // l'utilisateur, mais l'échec ne doit pas disparaître.
        console.warn("Copie du message d'invitation refusée", error);
      });
  };

  return (
    <View className="min-h-14 flex-row items-center gap-3 px-4 py-3">
      <View className="min-w-0 flex-1">
        <Text className="text-sm" numberOfLines={1}>
          {invitation.email}
        </Text>
        <Text className="text-xs text-muted-foreground">En attente</Text>
      </View>
      <Button
        variant="ghost"
        onPress={copy}
        accessibilityLabel={`Copier le message d'invitation pour ${invitation.email}`}
        className="gap-2"
      >
        <Icon as={copied ? Check : Copy} size={14} className="text-muted-foreground" />
        <Text className="text-sm text-muted-foreground">
          {copied ? "Copié" : "Copier le message"}
        </Text>
      </Button>
      <Button
        variant="ghost"
        onPress={onRevoke}
        disabled={disabled}
        accessibilityLabel={`Annuler l'invitation de ${invitation.email}`}
      >
        <Text className="text-destructive">Annuler</Text>
      </Button>
    </View>
  );
}

function LeaveSection({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  const { session } = useAuth();
  const { removeMember } = useWorkspaceActions();
  const [confirming, setConfirming] = useState(false);
  const selfId = session?.user.id;

  if (!selfId) return null;

  return (
    <View className="items-start">
      <Button variant="ghost" onPress={() => setConfirming(true)} className="px-0">
        <Text className="text-destructive">Quitter l'espace</Text>
      </Button>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        variant="confirm"
        title={`Quitter « ${workspace.name} » ?`}
        description="Vous perdez l'accès à l'espace et à ses conversations. Seul un admin pourra vous réinviter."
        error={workspaceErrorMessage(
          removeMember.error,
          "Le départ a échoué. Réessayez dans un instant.",
        )}
        actions={[
          {
            label: "Rester",
            onPress: () => setConfirming(false),
            disabled: removeMember.isPending,
          },
          {
            label: "Quitter",
            variant: "destructive",
            disabled: removeMember.isPending,
            onPress: () =>
              removeMember.mutate(
                { workspaceId: workspace.id, userId: selfId },
                {
                  onSuccess: () => {
                    setConfirming(false);
                    router.replace("/chat");
                  },
                },
              ),
          },
        ]}
      />
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="text-base font-semibold" role="heading">
      {children}
    </Text>
  );
}

/** Le nom choisi, sinon l'adresse : un membre sans nom reste reconnaissable. */
function memberName(member: WorkspaceMember): string {
  return member.displayName ?? member.email ?? "Compte supprimé";
}
