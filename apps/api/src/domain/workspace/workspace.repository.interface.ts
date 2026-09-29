import type {
  ReceivedInvitation,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
} from "@jc/domain";

export interface IWorkspaceRepository {
  /** Les espaces dont `userId` est membre, avec son rôle dans chacun. */
  findMine(userId: string, accessToken: string): Promise<Workspace[]>;
  /** `null` si l'espace n'existe pas ou si `userId` n'en est pas membre. */
  findById(id: string, userId: string, accessToken: string): Promise<Workspace | null>;
  /** Crée l'espace et y inscrit `userId` comme admin. */
  create(userId: string, name: string, accessToken: string): Promise<Workspace>;
  rename(id: string, name: string, accessToken: string): Promise<void>;

  findMembers(workspaceId: string, accessToken: string): Promise<WorkspaceMember[]>;
  updateMemberRole(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    accessToken: string,
  ): Promise<void>;
  removeMember(workspaceId: string, userId: string, accessToken: string): Promise<void>;

  findPendingInvitations(workspaceId: string, accessToken: string): Promise<WorkspaceInvitation[]>;
  /** `null` si une invitation attend déjà cette adresse dans cet espace. */
  createInvitation(
    workspaceId: string,
    invitedBy: string,
    email: string,
    accessToken: string,
  ): Promise<WorkspaceInvitation | null>;
  /** `false` si aucune invitation en attente ne correspond. */
  deleteInvitation(
    invitationId: string,
    workspaceId: string,
    accessToken: string,
  ): Promise<boolean>;

  /** Invitations en attente adressées à `email`. */
  findReceivedInvitations(email: string, accessToken: string): Promise<ReceivedInvitation[]>;
  findReceivedInvitation(
    invitationId: string,
    email: string,
    accessToken: string,
  ): Promise<ReceivedInvitation | null>;
  /** Inscrit `userId` comme membre. Sans effet s'il l'est déjà. */
  join(workspaceId: string, userId: string, accessToken: string): Promise<void>;
  answerInvitation(
    invitationId: string,
    answer: "accepted" | "declined",
    accessToken: string,
  ): Promise<void>;
}
