import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "../shared/primitives";

/**
 * Espaces d'équipe — voir docs/COLLABORATION.md.
 *
 * Un espace réunit plusieurs comptes ; chacun garde à côté son espace
 * personnel. Dans l'interface, on dit « espace » et « membre » (§13.4.4).
 */

/** Même borne que la contrainte `workspaces.name` en base. */
export const WORKSPACE_NAME_MAX_LENGTH = 80;

export const workspaceRoleSchema = z.enum(["admin", "member"]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

/** Un espace vu par l'un de ses membres : `role` est celui de l'appelant. */
export const workspaceSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  role: workspaceRoleSchema,
  /** Affiché dans le sélecteur d'espace, sans charger la liste des membres. */
  memberCount: z.number().int().min(1),
  createdAt: isoDateTimeSchema,
});
export type Workspace = z.infer<typeof workspaceSchema>;

const workspaceNameSchema = z.string().trim().min(1).max(WORKSPACE_NAME_MAX_LENGTH);

export const createWorkspaceSchema = z.object({ name: workspaceNameSchema });
export type CreateWorkspace = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z.object({ name: workspaceNameSchema });
export type UpdateWorkspace = z.infer<typeof updateWorkspaceSchema>;

/**
 * Un collègue, tel qu'un membre de l'espace le voit : nom et adresse, rien
 * d'autre du profil — la mémoire et les réglages restent personnels.
 */
export const workspaceMemberSchema = z.object({
  userId: uuidSchema,
  /** `null` tant que le membre n'a pas choisi de nom. L'adresse sert alors de repère. */
  displayName: z.string().nullable(),
  /** `null` si le compte a disparu entre deux lectures. */
  email: z.string().nullable(),
  role: workspaceRoleSchema,
});
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;

export const updateWorkspaceMemberSchema = z.object({ role: workspaceRoleSchema });
export type UpdateWorkspaceMember = z.infer<typeof updateWorkspaceMemberSchema>;

/**
 * Adresse normalisée avant d'atteindre la base : c'est sous cette forme que
 * l'invitation est retrouvée à la connexion, quelle que soit la casse saisie.
 */
export const inviteToWorkspaceSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});
export type InviteToWorkspace = z.infer<typeof inviteToWorkspaceSchema>;

/** Invitation en attente, vue par un admin de l'espace. */
export const workspaceInvitationSchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  email: z.string(),
  createdAt: isoDateTimeSchema,
});
export type WorkspaceInvitation = z.infer<typeof workspaceInvitationSchema>;

/** Invitation en attente, vue par la personne invitée. */
export const receivedInvitationSchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  workspaceName: z.string(),
  createdAt: isoDateTimeSchema,
});
export type ReceivedInvitation = z.infer<typeof receivedInvitationSchema>;
