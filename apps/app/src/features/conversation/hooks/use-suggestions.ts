import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ResolveSuggestion } from "@jc/domain";
import { api } from "@/shared/lib/api";

/**
 * Propositions de l'assistant en attente d'un geste sur ce fil (§12.1).
 *
 * Requête à part plutôt qu'événement du flux : une proposition non tranchée
 * survit au rechargement de la page, ce qu'un événement de flux, consommé une
 * seule fois, ne permettrait pas.
 */
export function useSuggestions(conversationId: string) {
  const queryClient = useQueryClient();

  const suggestions = useQuery({
    queryKey: ["conversation", conversationId, "suggestions"],
    queryFn: () => api.assistant.suggestions(conversationId),
  });

  const resolve = useMutation({
    mutationFn: ({ id, action }: { id: string } & ResolveSuggestion) =>
      api.assistant.resolve(id, { action }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["conversation", conversationId, "suggestions"],
        }),
        // Accepter crée des dossiers : c'est la clé que lit la barre latérale.
        queryClient.invalidateQueries({ queryKey: ["folders"] }),
      ]);
    },
  });

  return { suggestions, resolve };
}
