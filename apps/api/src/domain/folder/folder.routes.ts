import { Hono } from "hono";
import { z } from "zod";
import {
  createFolderSchema,
  folderTreeQuerySchema,
  updateFolderSchema,
  uuidSchema,
} from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { validate } from "../../core/http.js";
import { folderRepository } from "./folder.repository.js";
import { FolderService } from "./folder.service.js";

const service = new FolderService(folderRepository);

const idParam = validate("param", z.object({ id: uuidSchema }));

export const folderRoutes = new Hono<AuthEnv>()
  .use(auth)

  .get("/", validate("query", folderTreeQuerySchema), async (c) => {
    const { workspaceId } = c.req.valid("query");
    const { accessToken } = c.get("user");
    return c.json(
      workspaceId
        ? await service.getWorkspaceTree(workspaceId, accessToken)
        : await service.getTree(accessToken),
    );
  })

  .post("/", validate("json", createFolderSchema), async (c) => {
    const user = c.get("user");
    return c.json(await service.create(user.id, c.req.valid("json"), user.accessToken), 201);
  })

  .patch("/:id", idParam, validate("json", updateFolderSchema), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await service.update(id, c.req.valid("json"), c.get("user").accessToken));
  })

  .delete("/:id", idParam, async (c) => {
    await service.delete(c.req.valid("param").id, c.get("user").accessToken);
    return c.body(null, 204);
  });
