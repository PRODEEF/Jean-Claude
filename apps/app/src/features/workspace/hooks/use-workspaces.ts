import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@jc/api-client";
import type { WorkspaceRole } from "@jc/domain";
import { api } from "@/shared/lib/api";

/** Les espaces de l'utilisateur connecté, avec son rôle dans chacun. */
export function useWorkspaces() {
  return useQuery({ queryKey: ["workspaces"], queryFn: () => api.workspaces.list() });
}

/** Invitations qui attendent l'utilisateur connecté, retrouvées par son adresse. */
export function useReceivedInvitations() {
  return useQuery({
    queryKey: ["workspaces", "received-invitations"],
    queryFn: () => api.workspaces.received.list(),
  });
}

export function useWorkspaceMembers(workspaceId: string) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "members"],
    queryFn: () => api.workspaces.members.list(workspaceId),
  });
}

/** Réservé aux admins : le serveur refuse la lecture à un simple membre. */
export function useWorkspaceInvitations(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "invitations"],
    queryFn: () => api.workspaces.invitations.list(workspaceId),
    enabled,
  });
}

/**
 * Mutations des espaces. Chacune invalide ce que le serveur a pu changer
 * plutôt que de patcher le cache : c'est lui qui tient les règles — un espace
 * garde un admin, on n'invite pas deux fois la même adresse.
 */
export function useWorkspaceActions() {
  const queryClient = useQueryClient();
  const refreshList = () => queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  const refreshWorkspace = (workspaceId: string) =>
    queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });

  const create = useMutation({
    mutationFn: (name: string) => api.workspaces.create({ name }),
    onSuccess: refreshList,
  });

  const rename = useMutation({
    mutationFn: (variables: { id: string; name: string }) =>
      api.workspaces.rename(variables.id, { name: variables.name }),
    onSuccess: refreshList,
  });

  const accept = useMutation({
    mutationFn: (invitationId: string) => api.workspaces.received.accept(invitationId),
    onSuccess: refreshList,
  });

  const decline = useMutation({
    mutationFn: (invitationId: string) => api.workspaces.received.decline(invitationId),
    onSuccess: refreshList,
  });

  const invite = useMutation({
    mutationFn: (variables: { workspaceId: string; email: string }) =>
      api.workspaces.invitations.create(variables.workspaceId, { email: variables.email }),
    onSuccess: (_invitation, variables) => refreshWorkspace(variables.workspaceId),
  });

  const revoke = useMutation({
    mutationFn: (variables: { workspaceId: string; invitationId: string }) =>
      api.workspaces.invitations.revoke(variables.workspaceId, variables.invitationId),
    onSuccess: (_result, variables) => refreshWorkspace(variables.workspaceId),
  });

  const changeRole = useMutation({
    mutationFn: (variables: { workspaceId: string; userId: string; role: WorkspaceRole }) =>
      api.workspaces.members.changeRole(variables.workspaceId, variables.userId, variables.role),
    onSuccess: async (_member, variables) => {
      // Son propre rôle peut changer : la liste des espaces porte le rôle de
      // l'appelant, et l'écran s'en sert pour montrer ou non les gestes d'admin.
      await Promise.all([refreshWorkspace(variables.workspaceId), refreshList()]);
    },
  });

  const removeMember = useMutation({
    mutationFn: (variables: { workspaceId: string; userId: string }) =>
      api.workspaces.members.remove(variables.workspaceId, variables.userId),
    onSuccess: async (_result, variables) => {
      await Promise.all([refreshWorkspace(variables.workspaceId), refreshList()]);
    },
  });

  return { create, rename, accept, decline, invite, revoke, changeRole, removeMember };
}

/**
 * Message à montrer après un échec. Les refus du serveur (4xx) sont écrits
 * pour l'utilisateur — « Cette personne est déjà membre de l'espace. » ; le
 * reste peut porter des fragments de requête et se remplace par `fallback`.
 */
export function workspaceErrorMessage(cause: Error | null, fallback: string): string | null {
  if (!cause) return null;
  if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) return cause.message;
  return fallback;
}
