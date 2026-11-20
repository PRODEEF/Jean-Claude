import { Hono } from "hono";
import { z } from "zod";
import { connectMailAccountSchema, mailFolderQuerySchema, uuidSchema } from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { config } from "../../core/config.js";
import { validate } from "../../core/http.js";
import { mailbox } from "../../core/mail/mailbox.js";
import { mailRepository } from "./mail.repository.js";
import { MailService } from "./mail.service.js";

const service = new MailService(mailRepository, mailbox, config.mailEncryptionKey);

const accountParamSchema = z.object({ accountId: uuidSchema });
const messageParamSchema = accountParamSchema.extend({ uid: z.coerce.number().int().positive() });

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
  .get("/inbox", async (c) => {
    const user = c.get("user");
    return c.json(await service.listAllInbox(user.id, user.accessToken));
  })

  .get("/accounts/:accountId/folders", validate("param", accountParamSchema), async (c) => {
    const user = c.get("user");
    const { accountId } = c.req.valid("param");
    return c.json(await service.listFolders(user.id, accountId, user.accessToken));
  })

  .get(
    "/accounts/:accountId/messages",
    validate("param", accountParamSchema),
    validate("query", mailFolderQuerySchema),
    async (c) => {
      const user = c.get("user");
      const { accountId } = c.req.valid("param");
      const { folder } = c.req.valid("query");
      return c.json(await service.listMessages(user.id, accountId, folder, user.accessToken));
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
  );
