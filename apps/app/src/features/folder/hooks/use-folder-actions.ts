import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateFolder, UpdateFolder } from "@jc/domain";
import { ApiError } from "@jc/api-client";
import { api } from "@/shared/lib/api";

/**
 * Mutations de dossier : création, renommage, déplacement, suppression.
 *
 * Toutes invalident `["conversations"]` autant que `["folders"]`. Ce n'est
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

  // Distincte de `rename` bien qu'elle appelle la même route : un déplacement
  // en cours ne doit pas rendre le renommage inerte, et l'inverse non plus.
  const move = useMutation({
    mutationFn: (variables: { id: string; parentId: string | null }) =>
      api.folders.update(variables.id, { parentId: variables.parentId }),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.folders.remove(id),
    onSuccess: refresh,
  });

  return { create, rename, move, remove };
}

/**
 * Ce qu'on peut montrer d'un déplacement raté.
 *
 * Nos 4xx portent un message écrit pour l'utilisateur — profondeur dépassée,
 * dossier homonyme. Tout le reste est une panne : la dire en clair reviendrait
 * à afficher une erreur du fournisseur, qui peut porter des fragments de
 * requête.
 */
export function moveErrorMessage(cause: Error): string {
  if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) return cause.message;
  return "Le déplacement a échoué. Réessayez dans un instant.";
}
