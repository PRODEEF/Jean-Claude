import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ResolveSuggestion, Suggestion } from "@jc/domain";
import { api } from "@/shared/lib/api";

/**
 * Propositions de l'assistant sur ce fil (§12.1).
 *
 * Requête à part plutôt qu'événement du flux : une proposition non tranchée
 * survit au rechargement de la page, ce qu'un événement de flux, consommé une
 * seule fois, ne permettrait pas.
 *
 * Le serveur rend aussi celles qui ont déjà été tranchées : une fois acceptée,
 * une proposition a créé des dossiers ou rangé la conversation, et ce qu'elle a
 * fait se relit dans le fil plutôt que de disparaître avec la carte.
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
        // Un rangement change le dossier sous lequel la conversation apparaît.
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
      ]);
    },
  });

  // Les deux listes ne vont pas au même endroit : ce qui attend un geste se
  // pose en pied de fil, là où l'utilisateur écrit ; ce qui est tranché
  // retourne à sa place dans l'historique.
  const { pending, resolved } = useMemo(() => split(suggestions.data ?? []), [suggestions.data]);

  return { pending, resolved, resolve };
}

function split(all: Suggestion[]): { pending: Suggestion[]; resolved: Suggestion[] } {
  return {
    pending: all.filter((suggestion) => suggestion.status === "pending"),
    resolved: all.filter((suggestion) => suggestion.status !== "pending"),
  };
}
