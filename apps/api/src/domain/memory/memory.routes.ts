import { Hono } from "hono";
import { z } from "zod";
import { createMemorySchema, updateMemorySchema, uuidSchema } from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { validate } from "../../core/http.js";
import { memoryRepository } from "./memory.repository.js";
import { MemoryService } from "./memory.service.js";

const service = new MemoryService(memoryRepository);

const idParam = validate("param", z.object({ id: uuidSchema }));

export const memoryRoutes = new Hono<AuthEnv>()
  .use(auth)

  .get("/", async (c) => c.json(await service.list(c.get("user").accessToken)))

  .post("/", validate("json", createMemorySchema), async (c) => {
    const user = c.get("user");
    return c.json(
      await service.add(user.id, c.req.valid("json").content, "user", user.accessToken),
      201,
    );
  })

  .patch("/:id", idParam, validate("json", updateMemorySchema), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await service.update(id, c.req.valid("json").content, c.get("user").accessToken));
  })

  .delete("/:id", idParam, async (c) => {
    await service.delete(c.req.valid("param").id, c.get("user").accessToken);
    return c.body(null, 204);
  });
