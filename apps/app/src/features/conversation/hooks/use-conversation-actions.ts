import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/lib/api";

/**
 * Mutations portant sur une conversation : titre, rangement, suppression.
 *
 * `save` fait les deux écritures d'un seul geste, sous une seule mutation :
 * l'utilisateur a rempli un formulaire, il attend un « Enregistrer », pas deux
 * états d'erreur distincts. Les deux appels sont idempotents — le serveur
 * calcule un différentiel sur les rattachements, réenvoyer les mêmes dossiers
 * ne réécrit rien et préserve l'origine des liaisons déjà posées (A.7).
 *
 * `source: "user"` marque le rangement comme manuel : c'est le signal dont
 * l'assistant se servira pour apprendre la logique de l'utilisateur (A.7).
 */
export function useConversationActions(conversationId: string) {
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: async (input: { title: string; folderIds: string[] }) => {
      await api.conversations.update(conversationId, { title: input.title });
      await api.conversations.assignFolders(conversationId, {
        folderIds: input.folderIds,
        source: "user",
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] }),
      ]);
    },
  });

  /**
   * Renommage seul, pour la rangée de saisie de la barre latérale : le nom s'y
   * édite là où il se lit, sans ouvrir la fenêtre de la conversation.
   */
  const rename = useMutation({
    mutationFn: (title: string) => api.conversations.update(conversationId, { title }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] }),
      ]);
    },
  });

  /**
   * Rangement seul, pour le dépôt d'une conversation sur un dossier.
   *
   * L'appelant décide s'il ajoute le dossier aux autres ou s'il remplace tout :
   * une conversation appartient à plusieurs dossiers à la fois (§5.2, A.1), les
   * deux gestes existent donc et ne se devinent pas.
   */
  const file = useMutation({
    mutationFn: (folderIds: string[]) =>
      api.conversations.assignFolders(conversationId, { folderIds, source: "user" }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] }),
      ]);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.conversations.remove(conversationId),
    // Pas d'invalidation de `["conversation", id]` : la conversation n'existe
    // plus, relancer sa requête ne rendrait qu'un 404.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });

  return { save, rename, file, remove };
}
