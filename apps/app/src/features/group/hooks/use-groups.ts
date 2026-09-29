import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { CreateGroup, Group } from "@jc/domain";
import { api } from "@/shared/lib/api";

/** Messages chargés à l'ouverture d'un fil de groupe, comme pour un fil personnel. */
const THREAD_PAGE_SIZE = 50;

export function useGroups(workspaceId: string) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "groups"],
    queryFn: () => api.groups.list(workspaceId),
  });
}

export function useGroup(groupId: string) {
  return useQuery({ queryKey: ["group", groupId], queryFn: () => api.groups.get(groupId) });
}

export function useGroupMessages(groupId: string) {
  return useQuery({
    queryKey: ["group", groupId, "messages"],
    queryFn: () => api.groups.messages(groupId, { limit: THREAD_PAGE_SIZE }),
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGroup) => api.groups.create(input),
    onSuccess: (group) =>
      queryClient.invalidateQueries({ queryKey: ["workspace", group.workspaceId, "groups"] }),
  });
}

export function useSendGroupMessage(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => api.groups.send(groupId, content),
    // Realtime préviendrait aussi, mais l'auteur n'a pas à attendre l'aller-
    // retour du flux pour voir son propre message.
    onSuccess: () => refreshGroup(queryClient, groupId),
  });
}

export function useSetGroupMuted(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (aiMuted: boolean) => api.groups.update(groupId, { aiMuted }),
    onSuccess: (group: Group) => queryClient.setQueryData(["group", groupId], group),
  });
}

export function useMarkGroupRead(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.groups.markRead(groupId),
    onSuccess: (group: Group) => {
      queryClient.setQueryData(["group", groupId], group);
      return invalidateGroupLists(queryClient);
    },
  });
}

/** Un message est arrivé dans ce groupe : son fil et les compteurs des listes changent. */
export function refreshGroup(queryClient: QueryClient, groupId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["group", groupId] }),
    invalidateGroupLists(queryClient),
  ]);
}

function invalidateGroupLists(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === "workspace" && query.queryKey[2] === "groups",
  });
}
