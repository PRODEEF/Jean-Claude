import { useState } from "react";
import { View } from "react-native";
import { Check } from "lucide-react-native";
import type { Group, WorkspaceMember } from "@jc/domain";
import {
  useWorkspaceMembers,
  workspaceErrorMessage,
} from "@/features/workspace/hooks/use-workspaces";
import { useAuth } from "@/shared/providers/auth-provider";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Text } from "@/shared/ui/text";
import { useCreateGroup } from "./hooks/use-groups";

export type CreateGroupDialogProps = {
  /** `null` = fenêtre fermée. */
  workspaceId: string | null;
  onClose: () => void;
  onCreated: (group: Group) => void;
};

export function CreateGroupDialog({ workspaceId, onClose, onCreated }: CreateGroupDialogProps) {
  if (!workspaceId) return null;

  return <GroupForm workspaceId={workspaceId} onClose={onClose} onCreated={onCreated} />;
}

function GroupForm({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: (group: Group) => void;
}) {
  const { session } = useAuth();
  const members = useWorkspaceMembers(workspaceId);
  const create = useCreateGroup();
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  // Le créateur est membre d'office : il n'a pas à se cocher lui-même.
  const others = (members.data ?? []).filter((member) => member.userId !== session?.user.id);
  const trimmed = title.trim();
  const ready = trimmed.length > 0 && selected.length > 0 && !create.isPending;

  const toggle = (userId: string) =>
    setSelected((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );

  const submit = () => {
    if (!ready) return;
    create.mutate({ workspaceId, title: trimmed, memberIds: selected }, { onSuccess: onCreated });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouvelle conversation"
      description="Une conversation avec les personnes de l'espace que vous choisissez."
      error={workspaceErrorMessage(
        create.error,
        "La conversation n'a pas pu être créée. Réessayez dans un instant.",
      )}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: create.isPending },
        { label: "Créer", variant: "default", onPress: submit, disabled: !ready },
      ]}
    >
      <View className="gap-2">
        <Text className="text-sm font-medium">Nom de la conversation</Text>
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder="Bureau, Kermesse, Comptabilité…"
          maxLength={120}
          autoFocus
          accessibilityLabel="Nom de la conversation"
        />
      </View>

      <View className="gap-2">
        <Text className="text-sm font-medium">Avec qui</Text>
        {members.isLoading ? null : others.length === 0 ? (
          <Text className="text-sm italic text-muted-foreground">
            Personne d'autre dans l'espace pour l'instant. Invitez d'abord quelqu'un.
          </Text>
        ) : (
          <View className="overflow-hidden rounded-md border border-border">
            {others.map((member) => (
              <MemberCheck
                key={member.userId}
                member={member}
                checked={selected.includes(member.userId)}
                onToggle={() => toggle(member.userId)}
                disabled={create.isPending}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

/** Même rangée cochable que le rangement d'une conversation en dossiers. */
function MemberCheck({
  member,
  checked,
  onToggle,
  disabled,
}: {
  member: WorkspaceMember;
  checked: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const name = member.displayName ?? member.email ?? "Membre";

  return (
    <Button
      variant="ghost"
      onPress={onToggle}
      disabled={disabled}
      role="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={name}
      className="h-11 justify-start gap-3 rounded-none px-3 sm:h-11"
    >
      <View
        className={
          checked
            ? "size-5 items-center justify-center rounded border border-primary bg-primary"
            : "size-5 items-center justify-center rounded border border-border"
        }
      >
        {checked ? <Icon as={Check} size={14} className="text-primary-foreground" /> : null}
      </View>
      <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
        {name}
      </Text>
    </Button>
  );
}
