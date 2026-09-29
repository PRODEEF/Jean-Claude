import { randomUUID } from "node:crypto";
import type {
  ReceivedInvitation,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
} from "@jc/domain";
import { forUser } from "../../core/supabase/supabase.js";
import type { IWorkspaceRepository } from "./workspace.repository.interface.js";

/** Lignes Postgres — snake_case, telles que renvoyées par Supabase. */
type WorkspaceRow = {
  id: string;
  name: string;
  created_at: string;
  /** Agrégat PostgREST : une seule ligne `{ count }`. */
  workspace_members: { count: number }[];
};

/** Adhésion de l'appelant, avec l'espace embarqué. */
type MembershipRow = { role: string; workspaces: WorkspaceRow | null };

type MemberRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: string;
};

type InvitationRow = { id: string; workspace_id: string; email: string; created_at: string };

type ReceivedInvitationRow = {
  id: string;
  workspace_id: string;
  created_at: string;
  workspaces: { name: string } | null;
};

/** Violation d'unicité : membre déjà inscrit, invitation déjà en attente. */
const UNIQUE_VIOLATION = "23505";

function toWorkspace(row: MembershipRow): Workspace | null {
  if (!row.workspaces) return null;
  return {
    id: row.workspaces.id,
    name: row.workspaces.name,
    role: row.role as Workspace["role"],
    memberCount: row.workspaces.workspace_members[0]?.count ?? 1,
    createdAt: row.workspaces.created_at,
  };
}

function toMember(row: MemberRow): WorkspaceMember {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    role: row.role as WorkspaceMember["role"],
  };
}

function toInvitation(row: InvitationRow): WorkspaceInvitation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    email: row.email,
    createdAt: row.created_at,
  };
}

function toReceivedInvitation(row: ReceivedInvitationRow): ReceivedInvitation | null {
  if (!row.workspaces) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspaces.name,
    createdAt: row.created_at,
  };
}

const MEMBERSHIP_COLUMNS = "role, workspaces(id, name, created_at, workspace_members(count))";
const INVITATION_COLUMNS = "id, workspace_id, email, created_at";
const RECEIVED_INVITATION_COLUMNS = "id, workspace_id, created_at, workspaces(name)";

export const workspaceRepository: IWorkspaceRepository = {
  async findMine(userId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_members")
      .select(MEMBERSHIP_COLUMNS)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);
    return (data as unknown as MembershipRow[])
      .map(toWorkspace)
      .filter((workspace): workspace is Workspace => workspace !== null)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  },

  async findById(id, userId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_members")
      .select(MEMBERSHIP_COLUMNS)
      .eq("workspace_id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toWorkspace(data as unknown as MembershipRow) : null;
  },

  async create(userId, name, accessToken) {
    const client = forUser(accessToken);
    // Composé ici plutôt que relu : l'espace n'est lisible qu'une fois son
    // créateur inscrit comme membre, un `insert … returning` serait refusé.
    const workspace: Workspace = {
      id: randomUUID(),
      name,
      role: "admin",
      memberCount: 1,
      createdAt: new Date().toISOString(),
    };

    const { error } = await client.from("workspaces").insert({
      id: workspace.id,
      name: workspace.name,
      created_by: userId,
      created_at: workspace.createdAt,
    });
    if (error) throw new Error(error.message);

    const { error: memberError } = await client
      .from("workspace_members")
      .insert({ workspace_id: workspace.id, user_id: userId, role: "admin" });
    if (memberError) throw new Error(memberError.message);

    return workspace;
  },

  async rename(id, name, accessToken) {
    const { error } = await forUser(accessToken).from("workspaces").update({ name }).eq("id", id);
    if (error) throw new Error(error.message);
  },

  async findMembers(workspaceId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .rpc("workspace_member_profiles", { p_workspace: workspaceId })
      .order("display_name", { ascending: true, nullsFirst: false });

    if (error) throw new Error(error.message);
    return (data as unknown as MemberRow[]).map(toMember);
  },

  async updateMemberRole(workspaceId, userId, role, accessToken) {
    const { error } = await forUser(accessToken)
      .from("workspace_members")
      .update({ role })
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);
  },

  async removeMember(workspaceId, userId, accessToken) {
    const { error } = await forUser(accessToken)
      .from("workspace_members")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);
  },

  async findPendingInvitations(workspaceId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_invitations")
      .select(INVITATION_COLUMNS)
      .eq("workspace_id", workspaceId)
      .is("accepted_at", null)
      .is("declined_at", null)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data as unknown as InvitationRow[]).map(toInvitation);
  },

  async createInvitation(workspaceId, invitedBy, email, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_invitations")
      .insert({ workspace_id: workspaceId, email, invited_by: invitedBy })
      .select(INVITATION_COLUMNS)
      .single();

    if (error?.code === UNIQUE_VIOLATION) return null;
    if (error) throw new Error(error.message);
    return toInvitation(data as unknown as InvitationRow);
  },

  async deleteInvitation(invitationId, workspaceId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_invitations")
      .delete()
      .eq("id", invitationId)
      .eq("workspace_id", workspaceId)
      .is("accepted_at", null)
      .is("declined_at", null)
      .select("id");

    if (error) throw new Error(error.message);
    return (data as unknown[]).length > 0;
  },

  async findReceivedInvitations(email, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_invitations")
      .select(RECEIVED_INVITATION_COLUMNS)
      .eq("email", email)
      .is("accepted_at", null)
      .is("declined_at", null)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data as unknown as ReceivedInvitationRow[])
      .map(toReceivedInvitation)
      .filter((invitation): invitation is ReceivedInvitation => invitation !== null);
  },

  async findReceivedInvitation(invitationId, email, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_invitations")
      .select(RECEIVED_INVITATION_COLUMNS)
      .eq("id", invitationId)
      .eq("email", email)
      .is("accepted_at", null)
      .is("declined_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toReceivedInvitation(data as unknown as ReceivedInvitationRow) : null;
  },

  async join(workspaceId, userId, accessToken) {
    const { error } = await forUser(accessToken)
      .from("workspace_members")
      .insert({ workspace_id: workspaceId, user_id: userId, role: "member" });

    if (error?.code === UNIQUE_VIOLATION) return;
    if (error) throw new Error(error.message);
  },

  async answerInvitation(invitationId, answer, accessToken) {
    // Seules ces deux colonnes sont modifiables par la personne invitée
    // (privilège de colonne) : le payload n'en porte pas d'autre.
    const answeredAt = new Date().toISOString();
    const { error } = await forUser(accessToken)
      .from("workspace_invitations")
      .update(answer === "accepted" ? { accepted_at: answeredAt } : { declined_at: answeredAt })
      .eq("id", invitationId);

    if (error) throw new Error(error.message);
  },
};
