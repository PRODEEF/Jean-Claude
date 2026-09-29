import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/lib/api";

/** Fichiers de l'espace, du plus récent au plus ancien, page par page. */
export function useWorkspaceFiles(workspaceId: string, folderId: string | null) {
  return useInfiniteQuery({
    queryKey: ["workspace", workspaceId, "files", folderId],
    queryFn: ({ pageParam }) =>
      api.attachments.listWorkspaceFiles({
        workspaceId,
        ...(folderId ? { folderId } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

/**
 * L'espace a-t-il au moins un fichier lisible ? L'entrée « Fichiers » de la
 * barre ne s'affiche qu'à cette condition. Même préfixe de clé que la liste :
 * un envoi ou une suppression la relit aussi.
 */
export function useHasWorkspaceFiles(workspaceId: string | null) {
  const query = useQuery({
    queryKey: ["workspace", workspaceId, "files", "any"],
    queryFn: () => api.attachments.listWorkspaceFiles({ workspaceId: workspaceId ?? "", limit: 1 }),
    enabled: workspaceId !== null,
  });
  return (query.data?.items.length ?? 0) > 0;
}

/** Supprime un fichier envoyé : son auteur ou un admin, le serveur tranche. */
export function useDeleteWorkspaceFile(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => api.attachments.remove(fileId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, "files"] }),
        // Le message qui portait le fichier affiche désormais « Fichier supprimé ».
        queryClient.invalidateQueries({ queryKey: ["group"] }),
      ]),
  });
}
