import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Group } from "@jc/domain";
import { api } from "@/shared/lib/api";

/** Arborescence commune d'un espace, avec le compte des conversations rangées. */
export function useWorkspaceFolders(workspaceId: string) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "folders"],
    queryFn: () => api.folders.tree(workspaceId),
  });
}

/**
 * Créer, renommer, supprimer un dossier de l'espace. Tout membre le peut : c'est
 * une arborescence commune. Chaque geste invalide tout l'espace — dossiers,
 * compteurs, et rangement des conversations, qu'une suppression délie.
 */
export function useWorkspaceFolderActions(workspaceId: string) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });

  const create = useMutation({
    mutationFn: (input: { name: string; parentId: string | null }) =>
      api.folders.create({ ...input, workspaceId }),
    onSuccess: refresh,
  });

  const rename = useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      api.folders.update(input.id, { name: input.name }),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.folders.remove(id),
    onSuccess: refresh,
  });

  return { create, rename, remove };
}

/** Rangement d'une conversation d'espace : plusieurs dossiers à la fois (A.1). */
export function useAssignGroupFolders(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (folderIds: string[]) => api.groups.assignFolders(groupId, folderIds),
    onSuccess: (group: Group) => {
      queryClient.setQueryData(["group", groupId], group);
      return queryClient.invalidateQueries({ queryKey: ["workspace", group.workspaceId] });
    },
  });
}

/**
 * Range dans un dossier une conversation tout juste créée depuis ce dossier —
 * le seul cas où le rangement précède la capture (§13.4.1).
 */
export function useFileNewGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, folderId }: { groupId: string; folderId: string }) =>
      api.groups.assignFolders(groupId, [folderId]),
    onSuccess: (group: Group) => {
      queryClient.setQueryData(["group", group.id], group);
      return queryClient.invalidateQueries({ queryKey: ["workspace", group.workspaceId] });
    },
  });
}
