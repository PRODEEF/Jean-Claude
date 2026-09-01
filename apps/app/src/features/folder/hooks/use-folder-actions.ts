import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateFolder, UpdateFolder } from "@jc/domain";
import { api } from "@/shared/lib/api";

/**
 * Mutations de dossier : création, renommage, suppression.
 *
 * Les trois invalident `["conversations"]` autant que `["folders"]`. Ce n'est
 * pas de la prudence : supprimer un dossier ne supprime pas les conversations
 * qu'il contenait, il les délie (A.1). Leur `folderIds` change côté serveur, et
 * la barre latérale doit les reclasser en « Sans dossier » sans rechargement.
 */
export function useFolderActions() {
  const queryClient = useQueryClient();

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["folders"] }),
      queryClient.invalidateQueries({ queryKey: ["conversations"] }),
    ]);
  };

  const create = useMutation({
    mutationFn: (input: CreateFolder) => api.folders.create(input),
    onSuccess: refresh,
  });

  const rename = useMutation({
    mutationFn: (variables: { id: string; patch: UpdateFolder }) =>
      api.folders.update(variables.id, variables.patch),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.folders.remove(id),
    onSuccess: refresh,
  });

  return { create, rename, remove };
}
