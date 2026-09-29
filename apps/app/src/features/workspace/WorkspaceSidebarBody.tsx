import { useState } from "react";
import { ScrollView, View } from "react-native";
import { FileText, ListChecks, Plus } from "lucide-react-native";
import type { Group, WorkspaceTaskList } from "@jc/domain";
import { useGroups } from "@/features/group/hooks/use-groups";
import {
  rowLabel,
  SectionLabel,
  selected,
  UnreadBadge,
} from "@/features/navigation/SidebarSection";
import { useWorkspaceLists } from "@/features/workspace-list/hooks/use-workspace-lists";
import {
  WorkspaceListDialog,
  type WorkspaceListTarget,
} from "@/features/workspace-list/WorkspaceListDialog";
import { WorkspaceFolderDialog, type WorkspaceFolderTarget } from "./WorkspaceFolderDialog";
import { WorkspaceFolderTree } from "./WorkspaceFolderTree";
import { useWorkspaceFolders } from "./hooks/use-workspace-folders";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";

export type WorkspaceSidebarBodyProps = {
  workspaceId: string;
  pathname: string;
  onNavigate: (href: string) => void;
};

/**
 * Corps de la barre latérale quand un espace collaboratif est sélectionné.
 *
 * Même structure que l'espace personnel, dans le même ordre : les dossiers avec
 * ce qui y est rangé, puis toutes les conversations et listes à plat. Les
 * dossiers et conversations personnels s'effacent, comme les canaux d'un autre
 * espace dans Slack : on ne mêle pas ce qui est à soi et ce qui est à l'équipe.
 * Les membres se gèrent depuis le sélecteur d'espace.
 */
export function WorkspaceSidebarBody({
  workspaceId,
  pathname,
  onNavigate,
}: WorkspaceSidebarBodyProps) {
  const groups = useGroups(workspaceId);
  const folders = useWorkspaceFolders(workspaceId);
  const lists = useWorkspaceLists(workspaceId);
  const [listDialog, setListDialog] = useState<WorkspaceListTarget | null>(null);
  const [editing, setEditing] = useState<WorkspaceFolderTarget | null>(null);

  const renderGroup = (group: Group) => {
    const href = `/workspace/${workspaceId}/group/${group.id}`;
    return <GroupRow group={group} active={pathname === href} onPress={() => onNavigate(href)} />;
  };
  const renderList = (list: WorkspaceTaskList) => {
    const href = `/workspace/${workspaceId}/list/${list.id}`;
    return <ListRow list={list} active={pathname === href} onPress={() => onNavigate(href)} />;
  };
  const createFolder = () => setEditing({ kind: "create", parentId: null });
  const filesHref = `/workspace/${workspaceId}/files`;

  return (
    <ScrollView className="flex-1" contentContainerClassName="px-3 pb-4">
      {/* En tête, comme l'entrée « Fichiers » de Slack et de Teams : ce n'est
          ni un dossier ni une conversation, mais ce qu'elles contiennent. */}
      <Button
        variant="ghost"
        size="sm"
        onPress={() => onNavigate(filesHref)}
        className={selected("mt-2 w-full justify-start gap-2 px-2", pathname === filesHref)}
      >
        <Icon as={FileText} size={14} className="text-muted-foreground" />
        <Text className={rowLabel(pathname === filesHref)}>Fichiers</Text>
      </Button>

      <SectionLabel action={{ label: "Créer un dossier", onPress: createFolder }}>
        Dossiers
      </SectionLabel>

      {/* Message fixe, et non `error.message` : une erreur brute peut porter
          des fragments de requête. */}
      {folders.error ? (
        <Text className="px-2 py-1 text-xs text-destructive">
          Dossiers indisponibles pour le moment.
        </Text>
      ) : null}

      {folders.data?.length === 0 ? (
        <Button variant="ghost" onPress={createFolder} className="justify-start gap-2 px-2">
          <Icon as={Plus} size={14} className="text-muted-foreground" />
          <Text className="text-xs font-normal text-muted-foreground">
            Créer un premier dossier
          </Text>
        </Button>
      ) : null}

      <WorkspaceFolderTree
        nodes={folders.data ?? []}
        groups={groups.data ?? []}
        lists={lists.data ?? []}
        onEdit={setEditing}
        renderGroup={renderGroup}
        renderList={renderList}
      />

      {/* Le « + » n'existe pas dans l'espace personnel, où une liste naît d'une
          conversation ou d'un dossier. Il reste ici : sans lui, une liste
          partagée n'aurait plus aucun point d'entrée. */}
      <SectionLabel
        action={{
          label: "Créer une liste partagée",
          onPress: () => setListDialog({ kind: "create", workspaceId }),
        }}
      >
        Conversations et tâches
      </SectionLabel>

      {groups.error || lists.error ? (
        <Text className="px-2 py-1 text-xs text-destructive">
          Conversations indisponibles pour le moment.
        </Text>
      ) : null}

      {groups.data?.map((group) => (
        <View key={group.id}>{renderGroup(group)}</View>
      ))}
      {lists.data?.map((list) => (
        <View key={list.id}>{renderList(list)}</View>
      ))}

      <WorkspaceListDialog
        target={listDialog}
        onClose={() => setListDialog(null)}
        onDone={(list) => {
          setListDialog(null);
          if (list) onNavigate(`/workspace/${workspaceId}/list/${list.id}`);
        }}
      />

      <WorkspaceFolderDialog
        workspaceId={workspaceId}
        target={editing}
        onClose={() => setEditing(null)}
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
  // La conversation ouverte est marquée lue : sa pastille n'a pas à clignoter
  // le temps que l'écran s'en charge.
  const unread = active ? 0 : group.unreadCount;

  return (
    <View className={selected("flex-row items-center rounded-md", active)}>
      <Button
        variant="ghost"
        size="sm"
        onPress={onPress}
        accessibilityLabel={unread > 0 ? `${group.title}, ${unread} non lu(s)` : group.title}
        className="min-w-0 flex-1 justify-start px-2"
      >
        <Text className={rowLabel(active)} numberOfLines={1}>
          {group.title}
        </Text>
      </Button>
      <UnreadBadge count={unread} />
    </View>
  );
}

/** Une liste partagée, avec ce qu'il reste à faire. */
function ListRow({
  list,
  active,
  onPress,
}: {
  list: WorkspaceTaskList;
  active: boolean;
  onPress: () => void;
}) {
  const remaining = list.tasks.filter((task) => !task.done).length;

  return (
    <Button
      variant="ghost"
      size="sm"
      onPress={onPress}
      accessibilityLabel={`${list.title}, ${remaining} tâche(s) à faire`}
      className={selected("w-full justify-start gap-2 px-2", active)}
    >
      <Icon as={ListChecks} size={14} className="text-muted-foreground" />
      <Text className={rowLabel(active)} numberOfLines={1}>
        {list.title}
      </Text>
      {remaining > 0 ? <Text className="text-xs text-muted-foreground">{remaining}</Text> : null}
    </Button>
  );
}
