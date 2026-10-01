import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { ChevronDown, ChevronRight, Folder as FolderIcon, ListChecks, MessagesSquare, Plus } from "lucide-react-native";
import type { FolderTreeNode, Group, WorkspaceTaskList } from "@jc/domain";
import { CreateGroupDialog } from "@/features/group/CreateGroupDialog";
import { GroupDropDialog, type GroupDrop } from "@/features/group/GroupDropDialog";
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
  selected,
  UnreadBadge,
  useSectionOpen,
} from "@/features/navigation/SidebarSection";
import { useGroupDragSource } from "@/features/navigation/sidebar-drag";
import { useWorkspaceLists } from "@/features/workspace-list/hooks/use-workspace-lists";
import {
  WorkspaceListDialog,
  type WorkspaceListTarget,
} from "@/features/workspace-list/WorkspaceListDialog";
import { WorkspaceFolderDialog, type WorkspaceFolderTarget } from "./WorkspaceFolderDialog";
import { WorkspaceFolderTree } from "./WorkspaceFolderTree";
import {
  useFileNewGroup,
  useWorkspaceFolderActions,
  useWorkspaceFolders,
} from "./hooks/use-workspace-folders";
import { ApiError } from "@jc/api-client";
import { Button } from "@/shared/ui/button";
import { ContextMenu } from "@/shared/ui/context-menu";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Text } from "@/shared/ui/text";

export type WorkspaceSidebarBodyProps = {
  workspaceId: string;
  workspaceName: string;
  pathname: string;
  onNavigate: (href: string) => void;
};

/**
 * Un espace collaboratif, sous la section « Mes collaborations ».
 *
 * Rangée au gabarit d'une conversation, pas un titre de section : texte
 * courant, chevron à gauche. Une conversation sans dossier reste ici, sous
 * l'arborescence — elle figure aussi dans « Récents ».
 */
export function WorkspaceSidebarBody({
  workspaceId,
  workspaceName,
  pathname,
  onNavigate,
}: WorkspaceSidebarBodyProps) {
  const [open, toggle] = useSectionOpen(`workspace:${workspaceId}`);
  const groups = useGroups(workspaceId);
  const folders = useWorkspaceFolders(workspaceId);
  const lists = useWorkspaceLists(workspaceId);
  const [listDialog, setListDialog] = useState<WorkspaceListTarget | null>(null);
  const [editing, setEditing] = useState<WorkspaceFolderTarget | null>(null);
  /** Saisie du nom, sous la section — le « + » ne passe pas par une fenêtre. */
  const [namingRoot, setNamingRoot] = useState(false);
  /** Fenêtre « Nouvelle conversation » ouverte. */
  const [creating, setCreating] = useState(false);
  /** Dossier où la conversation naîtra rangée, `null` si elle reste à plat. */
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const fileNewGroup = useFileNewGroup();
  const [groupMenu, setGroupMenu] = useState<ConversationMenuTarget<Group> | null>(null);
  const [filing, setFiling] = useState<Group | null>(null);
  const [drop, setDrop] = useState<GroupDrop | null>(null);
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
  const createFolder = () => {
    if (!open) toggle();
    setNamingRoot(true);
  };
  const startConversation = (folderId: string | null) => {
    setCreatingIn(folderId);
    setCreating(true);
  };
  const membersHref = `/workspace/${workspaceId}`;
  const filesHref = `/workspace/${workspaceId}/files`;
  // Sans dossier : visibles ici, pas seulement dans « Récents ». Une
  // conversation rangée, elle, reste dans chacun de ses dossiers (A.1).
  const unfiledGroups = (groups.data ?? []).filter((group) => group.folderIds.length === 0);
  const unread = (groups.data ?? []).reduce((sum, group) => {
    if (pathname === `/workspace/${workspaceId}/group/${group.id}`) return sum;
    return sum + group.unreadCount;
  }, 0);

  const dropOnFolder = (folder: FolderTreeNode, groupId: string) => {
    const group = (groups.data ?? []).find((item) => item.id === groupId);
    // Un autre espace, ou déjà rangée uniquement ici : rien à demander.
    if (!group || group.workspaceId !== workspaceId) return;
    if (group.folderIds.length === 1 && group.folderIds[0] === folder.id) return;
    setDrop({ group, folder });
  };
  const unfiledLists = (lists.data ?? []).filter((list) => list.folderId === null);

  return (
    <>
      <View className="ml-4 border-l border-border pl-2">
        <WorkspaceHeading
          name={workspaceName}
          open={open}
          unread={unread}
          onToggle={toggle}
          menuItems={[
            { label: "Nouveau dossier", onPress: createFolder },
            { label: "Nouvelle conversation", onPress: () => startConversation(null) },
            { label: "Membres et invitations", onPress: () => onNavigate(membersHref) },
            { label: "Fichiers", onPress: () => onNavigate(filesHref) },
          ]}
        />
      </View>

      {/* Message fixe, et non `error.message` : une erreur brute peut porter
          des fragments de requête. */}
      {folders.error ? (
        <Text className="px-2 py-1 text-xs text-destructive">
          Dossiers indisponibles pour le moment.
        </Text>
      ) : null}

      {open ? (
        <>
          {folders.data?.length === 0 && !namingRoot ? (
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
            onNewConversation={(folderId) => startConversation(folderId)}
            onNewList={(folderId) => setListDialog({ kind: "create", workspaceId, folderId })}
            onDropGroup={dropOnFolder}
            pathname={pathname}
          />

          {namingRoot ? (
            <WorkspaceFolderNameRow
              workspaceId={workspaceId}
              onDone={() => setNamingRoot(false)}
            />
          ) : null}

          {unfiledGroups.map((group) => (
            <View key={group.id}>{renderGroup(group)}</View>
          ))}

          {unfiledLists.map((list) => (
            <View key={list.id}>{renderList(list)}</View>
          ))}

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
      <GroupDropDialog drop={drop} onClose={() => setDrop(null)} />

      <CreateGroupDialog
        workspaceId={creating ? workspaceId : null}
        onClose={() => {
          setCreating(false);
          setCreatingIn(null);
        }}
        onCreated={(group) => {
          const folderId = creatingIn;
          setCreating(false);
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
    </>
  );
}

/**
 * Création d'un dossier à la racine de l'espace, saisie sur place.
 *
 * Même geste que « Mes dossiers » : le champ apparaît sous la section,
 * Entrée ou un clic ailleurs valide, Échap abandonne.
 */
function WorkspaceFolderNameRow({
  workspaceId,
  onDone,
}: {
  workspaceId: string;
  onDone: () => void;
}) {
  const { create } = useWorkspaceFolderActions(workspaceId);
  const [name, setName] = useState("");
  const abandoned = useRef(false);
  // Le menu « … » se ferme au moment où le champ prend le focus : ce blur
  // immédiat, nom encore vide, fermait la saisie avant qu'on puisse écrire.
  const acceptBlur = useRef(false);
  useEffect(() => {
    const id = setTimeout(() => {
      acceptBlur.current = true;
    }, 300);
    return () => clearTimeout(id);
  }, []);

  const submit = (fromBlur = false) => {
    if (abandoned.current || create.isPending) return;
    if (fromBlur && !acceptBlur.current) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      onDone();
      return;
    }
    create.mutate({ name: trimmed, parentId: null }, { onSuccess: onDone });
  };

  return (
    <View className="gap-1 px-2 py-1">
      <View className="flex-row items-center gap-2">
        <Icon as={FolderIcon} size={16} className="text-muted-foreground" />
        <Input
          value={name}
          onChangeText={setName}
          placeholder="Nom du dossier"
          accessibilityLabel="Nom du dossier"
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={() => submit(false)}
          onBlur={() => submit(true)}
          onKeyPress={(event) => {
            if (event.nativeEvent.key === "Escape") {
              abandoned.current = true;
              onDone();
            }
          }}
          editable={!create.isPending}
          className="h-8 flex-1"
        />
      </View>
      {create.isError ? (
        <Text className="text-xs text-destructive">Enregistrement impossible. Réessayez.</Text>
      ) : null}
    </View>
  );
}

/** Espace sous « Mes collaborations » : le gabarit d'une conversation, pas d'un titre. */
function WorkspaceHeading({
  name,
  open,
  unread,
  onToggle,
  menuItems,
}: {
  name: string;
  open: boolean;
  unread: number;
  onToggle: () => void;
  menuItems: { label: string; onPress: () => void }[];
}) {
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const openMenu = (x: number, y: number) => setMenuAt({ x, y });

  return (
    <View className="group flex-row items-center rounded-md">
      <Button
        variant="ghost"
        size="sm"
        onPress={onToggle}
        onLongPress={(event) => openMenu(event.nativeEvent.pageX, event.nativeEvent.pageY)}
        {...contextMenuProps(openMenu)}
        accessibilityLabel={open ? `Replier ${name}` : `Déplier ${name}`}
        accessibilityState={{ expanded: open }}
        className="h-auto min-w-0 flex-1 justify-start gap-1.5 px-2"
      >
        <Icon
          as={open ? ChevronDown : ChevronRight}
          size={12}
          className="shrink-0 text-muted-foreground"
        />
        <Text className={rowLabel(false, unread > 0)} numberOfLines={1}>
          {name}
        </Text>
      </Button>
      {open ? null : <UnreadBadge count={unread} />}
      <RowMenuButton label={`Actions pour ${name}`} onOpen={openMenu} />
      {menuAt ? (
        <ContextMenu
          x={menuAt.x}
          y={menuAt.y}
          onClose={() => setMenuAt(null)}
          items={menuItems.map((item) => ({
            ...item,
            onPress: () => {
              setMenuAt(null);
              item.onPress();
            },
          }))}
        />
      ) : null}
    </View>
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
  const dragRef = useGroupDragSource(group.id);

  return (
    <View ref={dragRef} className={selected("group flex-row items-center rounded-md", active)}>
      <Button
        variant="ghost"
        size="sm"
        onPress={onPress}
        onLongPress={(event) =>
          onMenu({ conversation: group, x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })
        }
        {...contextMenuProps((x, y) => onMenu({ conversation: group, x, y }))}
        accessibilityLabel={
          unread > 0
            ? `${group.title}, conversation partagée, ${unread} non lu(s)`
            : `${group.title}, conversation partagée`
        }
        className="min-w-0 flex-1 justify-start gap-2 px-2"
      >
        <Icon as={MessagesSquare} size={14} className="text-muted-foreground" />
        <Text className={rowLabel(active, unread > 0)} numberOfLines={1}>
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
