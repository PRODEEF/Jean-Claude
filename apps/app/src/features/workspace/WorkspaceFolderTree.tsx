import { useState } from "react";
import { View } from "react-native";
import type { FolderTreeNode, Group, WorkspaceTaskList } from "@jc/domain";
import { FolderContextMenu, type FolderMenuTarget } from "@/features/folder/FolderContextMenu";
import {
  contextMenuProps,
  FolderToggleIcon,
  NewConversationRow,
  RowMenuButton,
  rowLabel,
} from "@/features/navigation/SidebarSection";
import { useSidebarLayout } from "@/features/navigation/use-sidebar-layout";
import { Button } from "@/shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
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
  /** Crée une conversation déjà rangée dans ce dossier — depuis un dossier vide. */
  onNewConversation: (folderId: string) => void;
  /** Crée une liste partagée déjà rangée dans ce dossier. */
  onNewList: (folderId: string) => void;
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

/**
 * Un dossier de l'espace, rendu comme un dossier personnel (`FolderGroup` de
 * `AppSidebar`) : mêmes composants, même menu (`FolderContextMenu`), mêmes
 * gestes — clic droit, « … » au survol, appui long au doigt. Les deux barres
 * doivent se manier pareil.
 */
function FolderRow({
  node,
  depth,
  ...props
}: WorkspaceFolderTreeProps & { node: FolderTreeNode; depth: number }) {
  const [menu, setMenu] = useState<FolderMenuTarget | null>(null);
  const filed = props.groups.filter((group) => group.folderIds.includes(node.id));
  const filedLists = props.lists.filter((list) => list.folderId === node.id);
  const isEmpty = node.children.length === 0 && filed.length === 0 && filedLists.length === 0;
  // Un dossier vide reste replié : le déplier allongerait la barre sans rien
  // apprendre. La nouvelle navigation les replie tous, comme l'espace personnel.
  const modern = useSidebarLayout() === "modern";
  const [open, setOpen] = useState(modern ? false : !isEmpty);
  const openMenu = (x: number, y: number) => setMenu({ folder: node, depth, x, y });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <View className="group flex-row items-center rounded-md">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="flex-1 justify-start gap-2 px-2"
            onLongPress={(event) => openMenu(event.nativeEvent.pageX, event.nativeEvent.pageY)}
            {...contextMenuProps(openMenu)}
          >
            <FolderToggleIcon open={open} modern={modern} />
            <Text className={rowLabel(false)} numberOfLines={1}>
              {node.name}
            </Text>
          </Button>
        </CollapsibleTrigger>

        <RowMenuButton label={`Actions pour ${node.name}`} onOpen={openMenu} />
      </View>

      <CollapsibleContent>
        <View className="ml-4 border-l border-border pl-2">
          {filed.map((group) => (
            <View key={group.id}>{props.renderGroup(group)}</View>
          ))}
          {filedLists.map((list) => (
            <View key={list.id}>{props.renderList(list)}</View>
          ))}
          {node.children.map((child) => (
            <FolderRow key={child.id} node={child} depth={depth + 1} {...props} />
          ))}
          {isEmpty ? <NewConversationRow onPress={() => props.onNewConversation(node.id)} /> : null}
        </View>
      </CollapsibleContent>

      <FolderContextMenu
        target={menu}
        onClose={() => setMenu(null)}
        onRename={() => edit({ kind: "rename", folder: node })}
        onAddChild={() => edit({ kind: "create", parentId: node.id })}
        onAddTaskList={() => {
          setMenu(null);
          props.onNewList(node.id);
        }}
        onDelete={() => edit({ kind: "delete", folder: node })}
      />
    </Collapsible>
  );

  function edit(target: WorkspaceFolderTarget) {
    setMenu(null);
    props.onEdit(target);
  }
}
