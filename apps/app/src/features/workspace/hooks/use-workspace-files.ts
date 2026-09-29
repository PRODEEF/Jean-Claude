import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
