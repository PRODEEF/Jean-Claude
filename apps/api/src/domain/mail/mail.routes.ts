import { Hono } from "hono";
import { z } from "zod";
import { connectMailAccountSchema } from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { config } from "../../core/config.js";
import { validate } from "../../core/http.js";
import { mailbox } from "../../core/mail/mailbox.js";
import { mailRepository } from "./mail.repository.js";
import { MailService } from "./mail.service.js";

const service = new MailService(mailRepository, mailbox, config.mailEncryptionKey);

const uidParamSchema = z.object({ uid: z.coerce.number().int().positive() });

/**
 * Boîte mail : un geste direct de l'utilisateur, comme ses réglages — jamais
 * atteinte depuis l'assistant (§12.1).
 */
export const mailRoutes = new Hono<AuthEnv>()
  .use(auth)

  .get("/account", async (c) => {
    const user = c.get("user");
    return c.json(await service.getAccount(user.id, user.accessToken));
  })

  .post("/account", validate("json", connectMailAccountSchema), async (c) => {
    const user = c.get("user");
    return c.json(await service.connect(user.id, c.req.valid("json"), user.accessToken), 201);
  })

  .delete("/account", async (c) => {
    const user = c.get("user");
    await service.disconnect(user.id, user.accessToken);
    return c.body(null, 204);
  })

  // Route littérale avant la route paramétrée.
  .get("/messages", async (c) => {
    const user = c.get("user");
    return c.json(await service.listMessages(user.id, user.accessToken));
  })

  .get("/messages/:uid", validate("param", uidParamSchema), async (c) => {
    const user = c.get("user");
    const { uid } = c.req.valid("param");
    return c.json(await service.readMessage(user.id, uid, user.accessToken));
  });
