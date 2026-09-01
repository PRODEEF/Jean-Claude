import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Conversation, Folder, FolderTreeNode } from "@jc/domain";
import { api } from "@/shared/lib/api";

export type SidebarSubGroup = {
  folder: Folder;
  conversations: Conversation[];
};

export type SidebarGroup = {
  folder: FolderTreeNode;
  /** Rattachées au dossier racine lui-même, pas à l'un de ses sous-dossiers. */
  conversations: Conversation[];
  children: SidebarSubGroup[];
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
 * Deux niveaux, sans récursion : `MAX_FOLDER_DEPTH` vaut 2 et le serveur
 * refuse un 3e. Une descente récursive laisserait croire le contraire.
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
    const roots = (folders.data ?? []).filter((node) => node.parentId === null);

    const inFolder = (folderId: string) =>
      items.filter((item) => item.folderIds.includes(folderId));

    const groups = roots.map((folder) => ({
      folder,
      conversations: inFolder(folder.id),
      children: folder.children.map((child) => ({
        folder: child,
        conversations: inFolder(child.id),
      })),
    }));

    return {
      groups,
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
