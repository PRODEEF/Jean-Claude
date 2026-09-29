import { Hono } from "hono";
import { z } from "zod";
import { createWorkspaceEventSchema, updateWorkspaceEventSchema, uuidSchema } from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { validate } from "../../core/http.js";
import { workspaceEventRepository } from "./workspace-event.repository.js";
import { WorkspaceEventService } from "./workspace-event.service.js";

const service = new WorkspaceEventService(workspaceEventRepository);

const idParam = validate("param", z.object({ id: uuidSchema }));

/** La lecture passe par `GET /api/calendar`, qui fusionne avec le calendrier personnel. */
export const workspaceEventRoutes = new Hono<AuthEnv>()
  .use(auth)

  .post("/", validate("json", createWorkspaceEventSchema), async (c) => {
    const user = c.get("user");
    return c.json(await service.create(user.id, c.req.valid("json"), user.accessToken), 201);
  })

  .patch("/:id", idParam, validate("json", updateWorkspaceEventSchema), async (c) => {
    const user = c.get("user");
    return c.json(
      await service.update(c.req.valid("param").id, user.id, c.req.valid("json"), user.accessToken),
    );
  })

  .delete("/:id", idParam, async (c) => {
    const user = c.get("user");
    await service.delete(c.req.valid("param").id, user.id, user.accessToken);
    return c.body(null, 204);
  });
