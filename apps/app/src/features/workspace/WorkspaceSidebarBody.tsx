import { useState } from "react";
import { ScrollView, View } from "react-native";
import { ListChecks, Plus } from "lucide-react-native";
import type { Group, WorkspaceTaskList } from "@jc/domain";
import { CreateGroupDialog } from "@/features/group/CreateGroupDialog";
import {
  ConversationContextMenu,
  type ConversationMenuTarget,
} from "@/features/conversation/ConversationContextMenu";
import { GroupFoldersDialog } from "@/features/group/GroupFoldersDialog";
import { useExtractGroupList, useGroups } from "@/features/group/hooks/use-groups";
import {
  contextMenuProps,
  RowMenuButton,
  rowLabel,
  RECENT_PAGE_SIZE,
  SectionLabel,
  selected,
  ShowMoreRow,
  UnreadBadge,
  useSectionOpen,
} from "@/features/navigation/SidebarSection";
import { useSidebarLayout } from "@/features/navigation/use-sidebar-layout";
import { useWorkspaceLists } from "@/features/workspace-list/hooks/use-workspace-lists";
import {
  WorkspaceListDialog,
  type WorkspaceListTarget,
} from "@/features/workspace-list/WorkspaceListDialog";
import { WorkspaceFolderDialog, type WorkspaceFolderTarget } from "./WorkspaceFolderDialog";
import { WorkspaceFolderTree } from "./WorkspaceFolderTree";
import { useFileNewGroup, useWorkspaceFolders } from "./hooks/use-workspace-folders";
import { ApiError } from "@jc/api-client";
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
  // La variante Accueil ouvre la même barre, en tiroir : elle en reprend la
  // présentation latérale, pensée sans bandeau au-dessus.
  const modern = useSidebarLayout() !== "classic";
  const [foldersOpen, toggleFolders] = useSectionOpen("folders");
  const [conversationsOpen, toggleConversations] = useSectionOpen("conversations");
  const [recentLimit, setRecentLimit] = useState(RECENT_PAGE_SIZE);
  const groups = useGroups(workspaceId);
  const folders = useWorkspaceFolders(workspaceId);
  const lists = useWorkspaceLists(workspaceId);
  const [listDialog, setListDialog] = useState<WorkspaceListTarget | null>(null);
  const [editing, setEditing] = useState<WorkspaceFolderTarget | null>(null);
  /** Dossier d'où l'on crée une conversation, qui y naîtra rangée. */
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const fileNewGroup = useFileNewGroup();
  const [groupMenu, setGroupMenu] = useState<ConversationMenuTarget<Group> | null>(null);
  const [filing, setFiling] = useState<Group | null>(null);
  const extractList = useExtractGroupList();

  const renderGroup = (group: Group) => {
    const href = `/workspace/${workspaceId}/group/${group.id}`;
    return (
      <GroupRow
        group={group}
        active={pathname === href}
        onPress={() => onNavigate(href)}
        onMenu={setGroupMenu}
      />
    );
  };
  const renderList = (list: WorkspaceTaskList) => {
    const href = `/workspace/${workspaceId}/list/${list.id}`;
    return <ListRow list={list} active={pathname === href} onPress={() => onNavigate(href)} />;
  };
  // Une seule limite pour les conversations puis les listes, dans l'ordre où
  // elles s'affichent : « Récents » se lit comme une seule liste.
  const allGroups = groups.data ?? [];
  const allLists = lists.data ?? [];
  const visibleGroups = modern ? allGroups.slice(0, recentLimit) : allGroups;
  const visibleLists = modern
    ? allLists.slice(0, Math.max(0, recentLimit - allGroups.length))
    : allLists;
  const createFolder = () => setEditing({ kind: "create", parentId: null });

  return (
    <ScrollView className="flex-1" contentContainerClassName="px-3 pb-4">
      <SectionLabel
        action={{ label: "Créer un dossier", onPress: createFolder }}
        {...(modern ? { collapse: { open: foldersOpen, onToggle: toggleFolders } } : {})}
      >
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

      {!modern || foldersOpen ? (
        <WorkspaceFolderTree
          nodes={folders.data ?? []}
          groups={groups.data ?? []}
          lists={lists.data ?? []}
          onEdit={setEditing}
          renderGroup={renderGroup}
          renderList={renderList}
          onNewConversation={setCreatingIn}
          onNewList={(folderId) => setListDialog({ kind: "create", workspaceId, folderId })}
        />
      ) : null}

      {/* Pas de « + », comme dans l'espace personnel : une liste partagée naît
          d'un dossier (« Nouvelle todoliste ») ou d'une proposition de
          Jean-Claude dans une conversation. */}
      <SectionLabel
        {...(modern
          ? { collapse: { open: conversationsOpen, onToggle: toggleConversations } }
          : {})}
      >
        {modern ? "Récents" : "Conversations et tâches"}
      </SectionLabel>

      {/* Un 4xx dit pourquoi la conversion a été refusée, dans un message
          écrit pour l'utilisateur ; au-delà, message fixe. */}
      {extractList.error ? (
        <Text className="px-2 py-1 text-xs text-destructive">
          {extractList.error instanceof ApiError && extractList.error.status < 500
            ? extractList.error.message
            : "La conversion en todoliste a échoué. Réessayez dans un instant."}
        </Text>
      ) : null}

      {groups.error || lists.error ? (
        <Text className="px-2 py-1 text-xs text-destructive">
          Conversations indisponibles pour le moment.
        </Text>
      ) : null}

      {!modern || conversationsOpen ? (
        <>
          {visibleGroups.map((group) => (
            <View key={group.id}>{renderGroup(group)}</View>
          ))}
          {visibleLists.map((list) => (
            <View key={list.id}>{renderList(list)}</View>
          ))}
          {modern && allGroups.length + allLists.length > recentLimit ? (
            <ShowMoreRow onPress={() => setRecentLimit((limit) => limit + RECENT_PAGE_SIZE)} />
          ) : null}
        </>
      ) : null}

      <WorkspaceListDialog
        target={listDialog}
        onClose={() => setListDialog(null)}
        onDone={(list) => {
          setListDialog(null);
          if (list) onNavigate(`/workspace/${workspaceId}/list/${list.id}`);
        }}
      />

      <ConversationContextMenu<Group>
        target={groupMenu}
        onClose={() => setGroupMenu(null)}
        onFile={({ conversation }) => {
          setGroupMenu(null);
          setFiling(conversation);
        }}
        onConvertToTaskList={({ conversation }) => {
          setGroupMenu(null);
          // La carte se lit dans le fil de la conversation, comme en personnel.
          extractList.mutate(conversation.id, {
            onSuccess: () => onNavigate(`/workspace/${workspaceId}/group/${conversation.id}`),
          });
        }}
      />
      <GroupFoldersDialog group={filing} onClose={() => setFiling(null)} />

      <CreateGroupDialog
        workspaceId={creatingIn ? workspaceId : null}
        onClose={() => setCreatingIn(null)}
        onCreated={(group) => {
          const folderId = creatingIn;
          setCreatingIn(null);
          if (folderId) fileNewGroup.mutate({ groupId: group.id, folderId });
          onNavigate(`/workspace/${workspaceId}/group/${group.id}`);
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

/** Même rangée qu'une conversation personnelle : clic droit, « … » au survol, appui long. */
function GroupRow({
  group,
  active,
  onPress,
  onMenu,
}: {
  group: Group;
  active: boolean;
  onPress: () => void;
  onMenu: (target: ConversationMenuTarget<Group>) => void;
}) {
  // La conversation ouverte est marquée lue : sa pastille n'a pas à clignoter
  // le temps que l'écran s'en charge.
  const unread = active ? 0 : group.unreadCount;

  return (
    <View className={selected("group flex-row items-center rounded-md", active)}>
      <Button
        variant="ghost"
        size="sm"
        onPress={onPress}
        onLongPress={(event) =>
          onMenu({ conversation: group, x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })
        }
        {...contextMenuProps((x, y) => onMenu({ conversation: group, x, y }))}
        accessibilityLabel={unread > 0 ? `${group.title}, ${unread} non lu(s)` : group.title}
        className="min-w-0 flex-1 justify-start px-2"
      >
        <Text className={rowLabel(active)} numberOfLines={1}>
          {group.title}
        </Text>
      </Button>
      <UnreadBadge count={unread} />
      <RowMenuButton
        label={`Actions pour ${group.title}`}
        onOpen={(x, y) => onMenu({ conversation: group, x, y })}
      />
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
