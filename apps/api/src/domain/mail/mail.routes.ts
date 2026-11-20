import { Hono } from "hono";
import { z } from "zod";
import {
  connectMailAccountSchema,
  mailFolderQuerySchema,
  mailInboxQuerySchema,
  mailListQuerySchema,
  moveMailSchema,
  sendMailSchema,
  setMailFlagSchema,
  setMailSeenSchema,
  uuidSchema,
} from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { config } from "../../core/config.js";
import { validate } from "../../core/http.js";
import { mailbox } from "../../core/mail/mailbox.js";
import { mailRepository } from "./mail.repository.js";
import { MailService } from "./mail.service.js";

const service = new MailService(mailRepository, mailbox, config.mailEncryptionKey);

const accountParamSchema = z.object({ accountId: uuidSchema });
const messageParamSchema = accountParamSchema.extend({ uid: z.coerce.number().int().positive() });
const attachmentParamSchema = messageParamSchema.extend({ index: z.coerce.number().int().min(0) });

/**
 * Boîtes mail : un geste direct de l'utilisateur, comme ses réglages — jamais
 * atteinte depuis l'assistant (§12.1).
 */
export const mailRoutes = new Hono<AuthEnv>()
  .use(auth)

  .get("/accounts", async (c) => {
    const user = c.get("user");
    return c.json(await service.listAccounts(user.id, user.accessToken));
  })

  .post("/accounts", validate("json", connectMailAccountSchema), async (c) => {
    const user = c.get("user");
    return c.json(await service.connect(user.id, c.req.valid("json"), user.accessToken), 201);
  })

  .delete("/accounts/:accountId", validate("param", accountParamSchema), async (c) => {
    const user = c.get("user");
    await service.disconnect(user.id, c.req.valid("param").accountId, user.accessToken);
    return c.body(null, 204);
  })

  // Toutes les boîtes réunies : route littérale, avant tout ce qui est paramétré.
  .get("/inbox", validate("query", mailInboxQuerySchema), async (c) => {
    const user = c.get("user");
    const { limit, q, unseen } = c.req.valid("query");
    return c.json(
      await service.listAllInbox(
        user.id,
        { limit, query: q, unseenOnly: unseen },
        user.accessToken,
      ),
    );
  })

  .get("/accounts/:accountId/folders", validate("param", accountParamSchema), async (c) => {
    const user = c.get("user");
    const { accountId } = c.req.valid("param");
    return c.json(await service.listFolders(user.id, accountId, user.accessToken));
  })

  .get(
    "/accounts/:accountId/messages",
    validate("param", accountParamSchema),
    validate("query", mailListQuerySchema),
    async (c) => {
      const user = c.get("user");
      const { accountId } = c.req.valid("param");
      const { folder, limit, q, unseen } = c.req.valid("query");
      return c.json(
        await service.listMessages(
          user.id,
          accountId,
          folder,
          { limit, query: q, unseenOnly: unseen },
          user.accessToken,
        ),
      );
    },
  )

  .get(
    "/accounts/:accountId/messages/:uid",
    validate("param", messageParamSchema),
    validate("query", mailFolderQuerySchema),
    async (c) => {
      const user = c.get("user");
      const { accountId, uid } = c.req.valid("param");
      const { folder } = c.req.valid("query");
      return c.json(await service.readMessage(user.id, accountId, folder, uid, user.accessToken));
    },
  )

  .post(
    "/accounts/:accountId/messages/:uid/seen",
    validate("param", messageParamSchema),
    validate("query", mailFolderQuerySchema),
    validate("json", setMailSeenSchema),
    async (c) => {
      const user = c.get("user");
      const { accountId, uid } = c.req.valid("param");
      const { folder } = c.req.valid("query");
      const { seen } = c.req.valid("json");
      await service.setSeen(user.id, accountId, folder, uid, seen, user.accessToken);
      return c.body(null, 204);
    },
  )

  .get(
    "/accounts/:accountId/messages/:uid/attachments/:index",
    validate("param", attachmentParamSchema),
    validate("query", mailFolderQuerySchema),
    async (c) => {
      const user = c.get("user");
      const { accountId, uid, index } = c.req.valid("param");
      const { folder } = c.req.valid("query");
      const attachment = await service.getAttachment(
        user.id,
        accountId,
        folder,
        uid,
        index,
        user.accessToken,
      );
      return c.body(new Uint8Array(attachment.content), 200, {
        "Content-Type": attachment.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
        // Le fichier se télécharge, il ne s'ouvre jamais dans la page de l'application.
        "X-Content-Type-Options": "nosniff",
      });
    },
  )

  .post(
    "/accounts/:accountId/messages/:uid/move",
    validate("param", messageParamSchema),
    validate("query", mailFolderQuerySchema),
    validate("json", moveMailSchema),
    async (c) => {
      const user = c.get("user");
      const { accountId, uid } = c.req.valid("param");
      const { folder } = c.req.valid("query");
      const move = c.req.valid("json");
      await service.move(
        user.id,
        accountId,
        folder,
        uid,
        move.to === "folder" ? { folder: move.folder } : move.to,
        user.accessToken,
      );
      return c.body(null, 204);
    },
  )

  .post(
    "/accounts/:accountId/send",
    validate("param", z.object({ accountId: uuidSchema })),
    validate("json", sendMailSchema),
    async (c) => {
      const user = c.get("user");
      const { accountId } = c.req.valid("param");
      await service.send(user.id, accountId, c.req.valid("json"), user.accessToken);
      return c.body(null, 204);
    },
  )

  .post(
    "/accounts/:accountId/messages/:uid/flag",
    validate("param", messageParamSchema),
    validate("query", mailFolderQuerySchema),
    validate("json", setMailFlagSchema),
    async (c) => {
      const user = c.get("user");
      const { accountId, uid } = c.req.valid("param");
      const { folder } = c.req.valid("query");
      const { flagged } = c.req.valid("json");
      await service.setFlagged(user.id, accountId, folder, uid, flagged, user.accessToken);
      return c.body(null, 204);
    },
  );
