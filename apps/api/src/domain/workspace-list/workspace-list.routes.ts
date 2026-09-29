import { Hono } from "hono";
import { z } from "zod";
import {
  createWorkspaceTaskListSchema,
  createWorkspaceTaskSchema,
  listWorkspaceTaskListsQuerySchema,
  updateWorkspaceTaskListSchema,
  updateWorkspaceTaskSchema,
  uuidSchema,
} from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { validate } from "../../core/http.js";
import { workspaceListRepository } from "./workspace-list.repository.js";
import { WorkspaceListService } from "./workspace-list.service.js";

const service = new WorkspaceListService(workspaceListRepository);

const idParam = validate("param", z.object({ id: uuidSchema }));
const taskParam = validate("param", z.object({ id: uuidSchema, taskId: uuidSchema }));

export const workspaceListRoutes = new Hono<AuthEnv>()
  .use(auth)

  .get("/", validate("query", listWorkspaceTaskListsQuerySchema), async (c) => {
    const user = c.get("user");
    return c.json(await service.list(c.req.valid("query").workspaceId, user.id, user.accessToken));
  })

  .post("/", validate("json", createWorkspaceTaskListSchema), async (c) => {
    const user = c.get("user");
    return c.json(await service.create(user.id, c.req.valid("json"), user.accessToken), 201);
  })

  .get("/:id", idParam, async (c) =>
    c.json(await service.get(c.req.valid("param").id, c.get("user").accessToken)),
  )

  .patch("/:id", idParam, validate("json", updateWorkspaceTaskListSchema), async (c) =>
    c.json(
      await service.update(c.req.valid("param").id, c.req.valid("json"), c.get("user").accessToken),
    ),
  )

  .delete("/:id", idParam, async (c) => {
    await service.delete(c.req.valid("param").id, c.get("user").accessToken);
    return c.body(null, 204);
  })

  // Une tâche s'écrit à part : deux membres qui cochent en même temps ne
  // s'écrasent pas.
  .post("/:id/tasks", idParam, validate("json", createWorkspaceTaskSchema), async (c) => {
    const user = c.get("user");
    return c.json(
      await service.addTask(
        user.id,
        c.req.valid("param").id,
        c.req.valid("json"),
        user.accessToken,
      ),
      201,
    );
  })

  .patch(
    "/:id/tasks/:taskId",
    taskParam,
    validate("json", updateWorkspaceTaskSchema),
    async (c) => {
      const { id, taskId } = c.req.valid("param");
      return c.json(
        await service.updateTask(id, taskId, c.req.valid("json"), c.get("user").accessToken),
      );
    },
  )

  .delete("/:id/tasks/:taskId", taskParam, async (c) => {
    const { id, taskId } = c.req.valid("param");
    await service.deleteTask(id, taskId, c.get("user").accessToken);
    return c.body(null, 204);
  });
