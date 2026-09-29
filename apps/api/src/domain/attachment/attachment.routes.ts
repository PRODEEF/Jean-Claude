import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  listWorkspaceFilesQuerySchema,
  MESSAGE_ATTACHMENT_MAX_BYTES,
  uuidSchema,
} from "@jc/domain";
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

      // Champ facultatif : absent, le fichier va au fil personnel.
      const rawWorkspaceId = body["workspaceId"];
      let workspaceId: string | null = null;
      if (rawWorkspaceId !== undefined) {
        const parsed = uuidSchema.safeParse(rawWorkspaceId);
        if (!parsed.success) throw httpError(400, "Espace invalide.");
        workspaceId = parsed.data;
      }

      const user = c.get("user");
      return c.json(await service.upload(user.id, file, workspaceId, user.accessToken), 201);
    },
  )

  // Page « Fichiers » d'un espace.
  .get("/", validate("query", listWorkspaceFilesQuerySchema), async (c) => {
    const user = c.get("user");
    return c.json(
      await service.listWorkspaceFiles(user.id, c.req.valid("query"), user.accessToken),
    );
  })

  .delete("/:id", idParam, async (c) => {
    const user = c.get("user");
    await service.remove(c.req.valid("param").id, user.id, user.accessToken);
    return c.body(null, 204);
  });
