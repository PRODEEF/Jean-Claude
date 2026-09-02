import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Conversation, FolderTreeNode, TaskList } from "@jc/domain";
import { useTaskLists } from "@/shared/hooks/use-task-lists";
import { api } from "@/shared/lib/api";

export type SidebarGroup = {
  folder: FolderTreeNode;
  /** Rattachées à ce dossier précisément, pas à l'un de ses descendants. */
  conversations: Conversation[];
  /** Todolistes rangées dans ce dossier — la liste y reste visible (A.2). */
  taskLists: TaskList[];
  children: SidebarGroup[];
};

export type SidebarData = {
  groups: SidebarGroup[];
  /** Conversations rattachées à aucun dossier — capture sans friction (§13.4.1). */
  unfiled: Conversation[];
  /**
   * Toutes les conversations de la barre, à plat.
   *
   * Un dépôt ne transporte qu'un identifiant : c'est ici qu'on retrouve la
   * conversation, et notamment les dossiers où elle est déjà rangée.
   */
  all: Conversation[];
  isLoading: boolean;
  error: Error | null;
};

/**
 * Arborescence affichée par la barre latérale.
 *
 * Le regroupement est fait ici et non côté serveur parce qu'il ne porte
 * aucune règle : une conversation appartenant à plusieurs dossiers (§5.2, A.1)
 * apparaît simplement sous chacun d'eux. Ce n'est pas une duplication, c'est
 * la même donnée vue depuis deux endroits.
 *
 * La descente est récursive et suit celle du serveur, bornée par
 * `MAX_FOLDER_DEPTH`.
 */
export function useSidebarData(): SidebarData {
  const folders = useQuery({
    queryKey: ["folders"],
    queryFn: () => api.folders.tree(),
  });

  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.conversations.list({ limit: 100 }),
  });

  const taskLists = useTaskLists();

  return useMemo(() => {
    // Le canal permanent a son entrée dédiée en haut de la barre (A.10) : le
    // laisser aussi dans la liste le ferait apparaître deux fois.
    const items = (conversations.data?.items ?? []).filter((item) => item.kind !== "assistant");

    // Les todolistes ne pèsent ni sur `isLoading` ni sur `error` : une panne
    // de leur côté ne doit pas effacer l'arborescence des conversations, qui
    // est la raison d'être de la barre.
    const lists = taskLists.data ?? [];

    const build = (node: FolderTreeNode): SidebarGroup => ({
      folder: node,
      conversations: items.filter((item) => item.folderIds.includes(node.id)),
      taskLists: lists.filter((list) => list.folderId === node.id),
      children: node.children.map(build),
    });

    return {
      groups: (folders.data ?? []).filter((node) => node.parentId === null).map(build),
      unfiled: items.filter((item) => item.folderIds.length === 0),
      all: items,
      isLoading: folders.isLoading || conversations.isLoading,
      error: (folders.error ?? conversations.error) as Error | null,
    };
  }, [
    folders.data,
    folders.isLoading,
    folders.error,
    conversations.data,
    conversations.isLoading,
    conversations.error,
    taskLists.data,
  ]);
}
