import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { MESSAGE_ATTACHMENT_MAX_BYTES, uuidSchema } from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { httpError, validate, type ApiErrorBody } from "../../core/http.js";
import { attachmentRepository } from "./attachment.repository.js";
import { AttachmentService } from "./attachment.service.js";

const service = new AttachmentService(attachmentRepository);

const idParam = validate("param", z.object({ id: uuidSchema }));

/** Marge au-delà de la taille d'image max : bornes, en-têtes et frontière multipart n'entrent pas dans `byteSize`. */
const BODY_LIMIT_BYTES = MESSAGE_ATTACHMENT_MAX_BYTES + 65_536;

export const attachmentRoutes = new Hono<AuthEnv>()
  .use(auth)

  .post(
    "/",
    bodyLimit({
      maxSize: BODY_LIMIT_BYTES,
      onError: (c) =>
        c.json(
          { statusCode: 413, message: "Image trop lourde : 10 Mo maximum." } satisfies ApiErrorBody,
          413,
        ),
    }),
    async (c) => {
      const body = await c.req.parseBody();
      const file = body["file"];
      if (!(file instanceof File)) throw httpError(400, "Fichier manquant.");

      const user = c.get("user");
      return c.json(await service.upload(user.id, file, user.accessToken), 201);
    },
  )

  .delete("/:id", idParam, async (c) => {
    await service.remove(c.req.valid("param").id, c.get("user").accessToken);
    return c.body(null, 204);
  });
