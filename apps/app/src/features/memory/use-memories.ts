import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/lib/api";

const KEY = ["memories"] as const;

/** Ce que Jean-Claude retient de l'utilisateur, du plus récent au plus ancien. */
export function useMemories(enabled = true) {
  return useQuery({ queryKey: KEY, queryFn: () => api.memories.list(), enabled });
}

export function useMemoryActions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });

  const add = useMutation({
    mutationFn: (content: string) => api.memories.create({ content }),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: (variables: { id: string; content: string }) =>
      api.memories.update(variables.id, { content: variables.content }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.memories.remove(id),
    onSuccess: refresh,
  });

  return { add, update, remove };
}
