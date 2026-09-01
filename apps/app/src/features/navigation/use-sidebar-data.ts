import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Conversation, FolderTreeNode } from "@jc/domain";
import { api } from "@/shared/lib/api";

export type SidebarGroup = {
  folder: FolderTreeNode;
  /** Rattachées à ce dossier précisément, pas à l'un de ses descendants. */
  conversations: Conversation[];
  children: SidebarGroup[];
};

export type SidebarData = {
  groups: SidebarGroup[];
  /** Conversations rattachées à aucun dossier — capture sans friction (§13.4.1). */
  unfiled: Conversation[];
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

  return useMemo(() => {
    // Le canal permanent a son entrée dédiée en haut de la barre (A.10) : le
    // laisser aussi dans la liste le ferait apparaître deux fois.
    const items = (conversations.data?.items ?? []).filter((item) => item.kind !== "assistant");

    const build = (node: FolderTreeNode): SidebarGroup => ({
      folder: node,
      conversations: items.filter((item) => item.folderIds.includes(node.id)),
      children: node.children.map(build),
    });

    return {
      groups: (folders.data ?? []).filter((node) => node.parentId === null).map(build),
      unfiled: items.filter((item) => item.folderIds.length === 0),
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
  ]);
}
