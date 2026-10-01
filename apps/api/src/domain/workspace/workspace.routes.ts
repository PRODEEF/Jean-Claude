import { Hono } from "hono";
import { z } from "zod";
import {
  createWorkspaceSchema,
  inviteToWorkspaceSchema,
  updateWorkspaceMemberSchema,
  updateWorkspaceSchema,
  uuidSchema,
} from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { validate } from "../../core/http.js";
import { sendInvitationEmail } from "../../core/mail/invitation-mail.js";
import { workspaceRepository } from "./workspace.repository.js";
import { WorkspaceService } from "./workspace.service.js";

const service = new WorkspaceService(workspaceRepository, {
  sendInvitation: sendInvitationEmail,
});

const idParam = validate("param", z.object({ id: uuidSchema }));
const invitationParam = validate("param", z.object({ invitationId: uuidSchema }));
const memberParam = validate("param", z.object({ id: uuidSchema, userId: uuidSchema }));
const workspaceInvitationParam = validate(
  "param",
  z.object({ id: uuidSchema, invitationId: uuidSchema }),
);

export const workspaceRoutes = new Hono<AuthEnv>()
  .use(auth)

  // ── Invitations reçues ─ routes littérales, avant `/:id` ─────────────────
  // L'adresse vient du jeton vérifié par `auth`, jamais de la requête : c'est
  // elle qui prouve que l'invitation vise l'appelant.
  .get("/invitations", async (c) => {
    const user = c.get("user");
    return c.json(await service.listReceivedInvitations(user.email, user.accessToken));
  })

  .post("/invitations/:invitationId/accept", invitationParam, async (c) => {
    const user = c.get("user");
    const { invitationId } = c.req.valid("param");
    return c.json(
      await service.acceptInvitation(invitationId, user.id, user.email, user.accessToken),
    );
  })

  .post("/invitations/:invitationId/decline", invitationParam, async (c) => {
    const user = c.get("user");
    await service.declineInvitation(
      c.req.valid("param").invitationId,
      user.email,
      user.accessToken,
    );
    return c.body(null, 204);
  })

  // ── Espaces ─────────────────────────────────────────────────────────────
  .get("/", async (c) => {
    const user = c.get("user");
    return c.json(await service.list(user.id, user.accessToken));
  })

  .post("/", validate("json", createWorkspaceSchema), async (c) => {
    const user = c.get("user");
    return c.json(await service.create(user.id, c.req.valid("json"), user.accessToken), 201);
  })

  .patch("/:id", idParam, validate("json", updateWorkspaceSchema), async (c) => {
    const user = c.get("user");
    return c.json(
      await service.rename(c.req.valid("param").id, user.id, c.req.valid("json"), user.accessToken),
    );
  })

  // ── Membres ─────────────────────────────────────────────────────────────
  .get("/:id/members", idParam, async (c) => {
    const user = c.get("user");
    return c.json(await service.listMembers(c.req.valid("param").id, user.id, user.accessToken));
  })

  .patch(
    "/:id/members/:userId",
    memberParam,
    validate("json", updateWorkspaceMemberSchema),
    async (c) => {
      const user = c.get("user");
      const { id, userId } = c.req.valid("param");
      return c.json(
        await service.changeRole(id, user.id, userId, c.req.valid("json").role, user.accessToken),
      );
    },
  )

  // Retirer un membre, ou quitter l'espace quand `userId` est l'appelant.
  .delete("/:id/members/:userId", memberParam, async (c) => {
    const user = c.get("user");
    const { id, userId } = c.req.valid("param");
    await service.removeMember(id, user.id, userId, user.accessToken);
    return c.body(null, 204);
  })

  // ── Invitations envoyées ────────────────────────────────────────────────
  .get("/:id/invitations", idParam, async (c) => {
    const user = c.get("user");
    return c.json(
      await service.listInvitations(c.req.valid("param").id, user.id, user.accessToken),
    );
  })

  .post("/:id/invitations", idParam, validate("json", inviteToWorkspaceSchema), async (c) => {
    const user = c.get("user");
    return c.json(
      await service.invite(c.req.valid("param").id, user.id, c.req.valid("json"), user.accessToken),
      201,
    );
  })

  .delete("/:id/invitations/:invitationId", workspaceInvitationParam, async (c) => {
    const user = c.get("user");
    const { id, invitationId } = c.req.valid("param");
    await service.revokeInvitation(id, user.id, invitationId, user.accessToken);
    return c.body(null, 204);
  });
