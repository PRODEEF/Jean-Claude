import { useState } from "react";
import { ScrollView, View } from "react-native";
import { MessagesSquare, Plus, Users } from "lucide-react-native";
import type { Group } from "@jc/domain";
import { CreateGroupDialog } from "@/features/group/CreateGroupDialog";
import { useGroups } from "@/features/group/hooks/use-groups";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";

export type WorkspaceSidebarBodyProps = {
  workspaceId: string;
  pathname: string;
  onNavigate: (href: string) => void;
};

/**
 * Corps de la barre latérale quand un espace d'équipe est sélectionné.
 *
 * Les dossiers et conversations personnels s'effacent, comme les canaux d'un
 * autre espace dans Slack : on ne mêle pas ce qui est à soi et ce qui est à
 * l'équipe.
 */
export function WorkspaceSidebarBody({
  workspaceId,
  pathname,
  onNavigate,
}: WorkspaceSidebarBodyProps) {
  const groups = useGroups(workspaceId);
  const [creating, setCreating] = useState(false);
  const membersHref = `/workspace/${workspaceId}`;

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-0.5 px-3 pb-4">
      <Button
        variant="ghost"
        onPress={() => onNavigate(membersHref)}
        className={cn("justify-start gap-3 px-2", pathname === membersHref && "bg-accent")}
      >
        <Icon as={Users} size={16} className="text-muted-foreground" />
        <Text
          className={cn(
            "text-sm text-foreground",
            pathname === membersHref ? "font-medium" : "font-normal",
          )}
        >
          Membres et invitations
        </Text>
      </Button>

      <View className="mt-3 flex-row items-center justify-between px-2 py-1">
        <Text className="text-xs font-medium text-muted-foreground">Groupes</Text>
        <Button
          variant="ghost"
          size="icon"
          onPress={() => setCreating(true)}
          accessibilityLabel="Créer un groupe"
          className="size-7"
        >
          <Icon as={Plus} size={14} className="text-muted-foreground" />
        </Button>
      </View>

      {/* Message fixe, et non `error.message` : une erreur brute peut porter
          des fragments de requête. */}
      {groups.error ? (
        <Text className="px-2 py-1 text-xs text-destructive">
          Groupes indisponibles pour le moment.
        </Text>
      ) : null}

      {groups.data?.length === 0 ? (
        <Button
          variant="ghost"
          onPress={() => setCreating(true)}
          className="justify-start gap-2 px-2"
        >
          <Icon as={Plus} size={14} className="text-muted-foreground" />
          <Text className="text-xs font-normal text-muted-foreground">Créer un premier groupe</Text>
        </Button>
      ) : null}

      {groups.data?.map((group) => {
        const href = `/workspace/${workspaceId}/group/${group.id}`;
        return (
          <GroupRow
            key={group.id}
            group={group}
            active={pathname === href}
            onPress={() => onNavigate(href)}
          />
        );
      })}

      <CreateGroupDialog
        workspaceId={creating ? workspaceId : null}
        onClose={() => setCreating(false)}
        onCreated={(group) => {
          setCreating(false);
          onNavigate(`/workspace/${workspaceId}/group/${group.id}`);
        }}
      />
    </ScrollView>
  );
}

function GroupRow({
  group,
  active,
  onPress,
}: {
  group: Group;
  active: boolean;
  onPress: () => void;
}) {
  // Le groupe ouvert est marqué lu : sa pastille n'a pas à clignoter le temps
  // que l'écran s'en charge.
  const unread = active ? 0 : group.unreadCount;

  return (
    <Button
      variant="ghost"
      onPress={onPress}
      accessibilityLabel={unread > 0 ? `${group.title}, ${unread} non lu(s)` : group.title}
      className={cn("justify-start gap-3 px-2", active && "bg-accent")}
    >
      <Icon as={MessagesSquare} size={16} className="text-muted-foreground" />
      <Text
        className={cn(
          "flex-1 text-sm text-foreground",
          active || unread > 0 ? "font-medium" : "font-normal",
        )}
        numberOfLines={1}
      >
        {group.title}
      </Text>
      {unread > 0 ? (
        <View
          className="min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5"
          style={{ height: 18 }}
        >
          <Text className="text-[10px] font-semibold leading-none text-primary-foreground">
            {unread}
          </Text>
        </View>
      ) : null}
    </Button>
  );
}
