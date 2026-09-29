import { useState } from "react";
import { View } from "react-native";
import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  MoreHorizontal,
} from "lucide-react-native";
import {
  MAX_FOLDER_DEPTH,
  type FolderTreeNode,
  type Group,
  type WorkspaceTaskList,
} from "@jc/domain";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { ContextMenu, type ContextMenuItem } from "@/shared/ui/context-menu";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import type { WorkspaceFolderTarget } from "./WorkspaceFolderDialog";

export type WorkspaceFolderTreeProps = {
  nodes: FolderTreeNode[];
  groups: Group[];
  lists: WorkspaceTaskList[];
  /** Ouvre la fenêtre de création, de renommage ou de suppression. */
  onEdit: (target: WorkspaceFolderTarget) => void;
  /** Rendu d'une conversation rangée — la même rangée que dans la liste à plat. */
  renderGroup: (group: Group) => React.ReactNode;
  renderList: (list: WorkspaceTaskList) => React.ReactNode;
};

/**
 * Arborescence commune d'un espace, avec les conversations rangées dans chaque
 * dossier. Une conversation rangée dans deux dossiers apparaît dans les deux :
 * c'est la même, visible depuis chacun (A.1).
 */
export function WorkspaceFolderTree(props: WorkspaceFolderTreeProps) {
  return (
    <>
      {props.nodes.map((node) => (
        <FolderRow key={node.id} node={node} depth={1} {...props} />
      ))}
    </>
  );
}

function FolderRow({
  node,
  depth,
  ...props
}: WorkspaceFolderTreeProps & { node: FolderTreeNode; depth: number }) {
  const [open, setOpen] = useState(true);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const filed = props.groups.filter((group) => group.folderIds.includes(node.id));
  const filedLists = props.lists.filter((list) => list.folderId === node.id);

  const items: ContextMenuItem[] = [
    // Au dernier niveau, un sous-dossier ne rentre plus : le serveur le refuse
    // déjà, autant ne pas proposer le geste.
    ...(depth < MAX_FOLDER_DEPTH
      ? [
          {
            label: "Nouveau sous-dossier",
            onPress: () => edit({ kind: "create", parentId: node.id }),
          },
        ]
      : []),
    { label: "Renommer", onPress: () => edit({ kind: "rename", folder: node }) },
    {
      label: "Supprimer",
      destructive: true,
      onPress: () => edit({ kind: "delete", folder: node }),
    },
  ];

  function edit(target: WorkspaceFolderTarget) {
    setMenu(null);
    props.onEdit(target);
  }

  return (
    <View>
      <View className="flex-row items-center">
        <Button
          variant="ghost"
          onPress={() => setOpen(!open)}
          accessibilityLabel={`${open ? "Replier" : "Déplier"} le dossier ${node.name}`}
          accessibilityState={{ expanded: open }}
          className="flex-1 justify-start gap-2 px-2"
        >
          <Icon
            as={open ? ChevronDown : ChevronRight}
            size={14}
            className="text-muted-foreground"
          />
          <Icon as={FolderIcon} size={16} className="text-muted-foreground" />
          <Text className="flex-1 text-sm font-normal text-muted-foreground" numberOfLines={1}>
            {node.name}
          </Text>
          {node.conversationCount > 0 ? (
            <Text className="text-xs text-muted-foreground">{node.conversationCount}</Text>
          ) : null}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onPress={(event) => setMenu({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })}
          accessibilityLabel={`Actions pour le dossier ${node.name}`}
          className="size-8"
        >
          <Icon as={MoreHorizontal} size={16} className="text-muted-foreground" />
        </Button>
      </View>

      {open ? (
        <View className={cn("ml-4 border-l border-border pl-2")}>
          {node.children.map((child) => (
            <FolderRow key={child.id} node={child} depth={depth + 1} {...props} />
          ))}
          {filed.map((group) => (
            <View key={group.id}>{props.renderGroup(group)}</View>
          ))}
          {filedLists.map((list) => (
            <View key={list.id}>{props.renderList(list)}</View>
          ))}
          {node.children.length === 0 && filed.length === 0 && filedLists.length === 0 ? (
            <Text className="px-2 py-1.5 text-xs italic text-muted-foreground">Vide</Text>
          ) : null}
        </View>
      ) : null}

      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />
      ) : null}
    </View>
  );
}
