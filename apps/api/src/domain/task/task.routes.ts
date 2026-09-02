import { Hono } from "hono";
import { z } from "zod";
import {
  createTaskListSchema,
  createTaskSchema,
  updateTaskListSchema,
  updateTaskSchema,
  uuidSchema,
} from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { validate } from "../../core/http.js";
import { taskRepository } from "./task.repository.js";
import { TaskService } from "./task.service.js";

const service = new TaskService(taskRepository);

const idParam = validate("param", z.object({ id: uuidSchema }));
const itemParams = validate("param", z.object({ id: uuidSchema, itemId: uuidSchema }));

/**
 * Todolistes (A.2).
 *
 * La ressource est la liste ; les tâches vivent sous elle en `/items`. Une
 * tâche n'existe pas hors d'une liste, et l'imbrication rend la filiation
 * vérifiable côté serveur plutôt que confiée à l'appelant.
 */
export const taskRoutes = new Hono<AuthEnv>()
  .use(auth)

  .get("/", async (c) => c.json(await service.list(c.get("user").accessToken)))

  .post("/", validate("json", createTaskListSchema), async (c) => {
    const user = c.get("user");
    return c.json(await service.createList(user.id, c.req.valid("json"), user.accessToken), 201);
  })

  .patch("/:id", idParam, validate("json", updateTaskListSchema), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await service.updateList(id, c.req.valid("json"), c.get("user").accessToken));
  })

  .delete("/:id", idParam, async (c) => {
    await service.deleteList(c.req.valid("param").id, c.get("user").accessToken);
    return c.body(null, 204);
  })

  .post("/:id/items", idParam, validate("json", createTaskSchema), async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    return c.json(
      await service.addTask(user.id, id, c.req.valid("json"), user.accessToken),
      201,
    );
  })

  .patch("/:id/items/:itemId", itemParams, validate("json", updateTaskSchema), async (c) => {
    const { id, itemId } = c.req.valid("param");
    return c.json(
      await service.updateTask(id, itemId, c.req.valid("json"), c.get("user").accessToken),
    );
  })

  .delete("/:id/items/:itemId", itemParams, async (c) => {
    const { id, itemId } = c.req.valid("param");
    await service.deleteTask(id, itemId, c.get("user").accessToken);
    return c.body(null, 204);
  });
