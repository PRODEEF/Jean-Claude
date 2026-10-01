import type {
  CreateWorkspace,
  InviteToWorkspace,
  ReceivedInvitation,
  UpdateWorkspace,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import { logger } from "../../core/logger.js";
import type { InvitationMail } from "../../core/mail/invitation-mail.js";
import type { IWorkspaceRepository } from "./workspace.repository.interface.js";

export type InvitationMailer = {
  sendInvitation(mail: InvitationMail): Promise<void>;
};

/**
 * Espaces d'équipe : qui en fait partie, qui y entre, qui le gère.
 *
 * La RLS refuse déjà ce qu'un compte n'a pas le droit de faire. Le service
 * vérifie les mêmes droits en amont pour rendre un message clair plutôt
 * qu'une écriture silencieusement ignorée, et porte les règles que la base ne
 * voit pas — un espace garde toujours au moins un admin.
 */
export class WorkspaceService {
  constructor(
    private readonly workspaces: IWorkspaceRepository,
    private readonly mailer: InvitationMailer = { sendInvitation: async () => undefined },
  ) {}

  list(userId: string, accessToken: string): Promise<Workspace[]> {
    return this.workspaces.findMine(userId, accessToken);
  }

  create(userId: string, input: CreateWorkspace, accessToken: string): Promise<Workspace> {
    return this.workspaces.create(userId, input.name, accessToken);
  }

  async rename(
    id: string,
    userId: string,
    input: UpdateWorkspace,
    accessToken: string,
  ): Promise<Workspace> {
    const workspace = await this.requireAdmin(id, userId, accessToken);
    await this.workspaces.rename(id, input.name, accessToken);
    return { ...workspace, name: input.name };
  }

  async listMembers(id: string, userId: string, accessToken: string): Promise<WorkspaceMember[]> {
    await this.requireMember(id, userId, accessToken);
    return this.workspaces.findMembers(id, accessToken);
  }

  async changeRole(
    id: string,
    actorId: string,
    targetId: string,
    role: WorkspaceRole,
    accessToken: string,
  ): Promise<WorkspaceMember> {
    await this.requireAdmin(id, actorId, accessToken);
    const members = await this.workspaces.findMembers(id, accessToken);
    const target = findMember(members, targetId);

    if (target.role === role) return target;
    if (target.role === "admin" && countAdmins(members) === 1) {
      throw httpError(409, "L'espace doit garder au moins un admin.");
    }

    await this.workspaces.updateMemberRole(id, targetId, role, accessToken);
    return { ...target, role };
  }

  /** Quitter l'espace soi-même, ou en retirer un membre quand on est admin. */
  async removeMember(
    id: string,
    actorId: string,
    targetId: string,
    accessToken: string,
  ): Promise<void> {
    const workspace = await this.requireMember(id, actorId, accessToken);
    const leaving = actorId === targetId;
    if (!leaving && workspace.role !== "admin") {
      throw httpError(403, "Seul un admin peut retirer un membre de l'espace.");
    }

    const members = await this.workspaces.findMembers(id, accessToken);
    const target = findMember(members, targetId);

    // Un espace sans admin ne pourrait plus inviter personne ni être renommé.
    if (target.role === "admin" && countAdmins(members) === 1) {
      throw httpError(
        409,
        leaving
          ? "Nommez un autre admin avant de quitter l'espace."
          : "L'espace doit garder au moins un admin.",
      );
    }

    await this.workspaces.removeMember(id, targetId, accessToken);
  }

  async listInvitations(
    id: string,
    userId: string,
    accessToken: string,
  ): Promise<WorkspaceInvitation[]> {
    await this.requireAdmin(id, userId, accessToken);
    return this.workspaces.findPendingInvitations(id, accessToken);
  }

  async invite(
    id: string,
    userId: string,
    input: InviteToWorkspace,
    accessToken: string,
  ): Promise<WorkspaceInvitation> {
    const workspace = await this.requireAdmin(id, userId, accessToken);

    const members = await this.workspaces.findMembers(id, accessToken);
    if (members.some((member) => member.email?.toLowerCase() === input.email)) {
      throw httpError(409, "Cette personne est déjà membre de l'espace.");
    }

    const invitation = await this.workspaces.createInvitation(id, userId, input.email, accessToken);
    if (!invitation) throw httpError(409, "Une invitation attend déjà cette adresse.");

    // L'invitation est déjà visible dans l'application. L'e-mail s'y ajoute ;
    // s'il échoue, la personne la verra quand même en se connectant.
    try {
      await this.mailer.sendInvitation({
        to: invitation.email,
        workspaceName: workspace.name,
      });
    } catch (cause) {
      logger.error("workspace.invite", "L'e-mail d'invitation n'a pas pu partir.", cause);
    }

    return invitation;
  }

  async revokeInvitation(
    id: string,
    userId: string,
    invitationId: string,
    accessToken: string,
  ): Promise<void> {
    await this.requireAdmin(id, userId, accessToken);
    const deleted = await this.workspaces.deleteInvitation(invitationId, id, accessToken);
    if (!deleted) throw httpError(404, "Invitation introuvable.");
  }

  listReceivedInvitations(email: string, accessToken: string): Promise<ReceivedInvitation[]> {
    return this.workspaces.findReceivedInvitations(normalizeEmail(email), accessToken);
  }

  async acceptInvitation(
    invitationId: string,
    userId: string,
    email: string,
    accessToken: string,
  ): Promise<Workspace> {
    const invitation = await this.requireReceivedInvitation(invitationId, email, accessToken);

    // L'inscription précède la réponse : la RLS n'ouvre l'espace qu'à une
    // invitation encore en attente. Si la réponse échoue ensuite, rejouer
    // l'acceptation retombe sur ses pieds — `join` ignore un membre existant.
    await this.workspaces.join(invitation.workspaceId, userId, accessToken);
    await this.workspaces.answerInvitation(invitationId, "accepted", accessToken);

    const workspace = await this.workspaces.findById(invitation.workspaceId, userId, accessToken);
    if (!workspace) throw new Error("Espace introuvable juste après l'avoir rejoint.");
    return workspace;
  }

  async declineInvitation(invitationId: string, email: string, accessToken: string): Promise<void> {
    await this.requireReceivedInvitation(invitationId, email, accessToken);
    await this.workspaces.answerInvitation(invitationId, "declined", accessToken);
  }

  /** Un non-membre reçoit un 404 et non un 403 : il n'a pas à savoir que l'espace existe. */
  private async requireMember(id: string, userId: string, accessToken: string): Promise<Workspace> {
    const workspace = await this.workspaces.findById(id, userId, accessToken);
    if (!workspace) throw httpError(404, "Espace introuvable.");
    return workspace;
  }

  private async requireAdmin(id: string, userId: string, accessToken: string): Promise<Workspace> {
    const workspace = await this.requireMember(id, userId, accessToken);
    if (workspace.role !== "admin") throw httpError(403, "Réservé aux admins de l'espace.");
    return workspace;
  }

  private async requireReceivedInvitation(
    invitationId: string,
    email: string,
    accessToken: string,
  ): Promise<ReceivedInvitation> {
    const invitation = await this.workspaces.findReceivedInvitation(
      invitationId,
      normalizeEmail(email),
      accessToken,
    );
    if (!invitation) throw httpError(404, "Invitation introuvable.");
    return invitation;
  }
}

function findMember(members: WorkspaceMember[], userId: string): WorkspaceMember {
  const member = members.find((candidate) => candidate.userId === userId);
  if (!member) throw httpError(404, "Membre introuvable.");
  return member;
}

function countAdmins(members: WorkspaceMember[]): number {
  return members.filter((member) => member.role === "admin").length;
}

/** Même forme que l'adresse stockée par l'invitation (`inviteToWorkspaceSchema`). */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
