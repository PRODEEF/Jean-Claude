import { Hono } from "hono";
import { z } from "zod";
import {
  createGroupSchema,
  cursorPaginationSchema,
  listGroupsQuerySchema,
  sendGroupMessageSchema,
  updateGroupSchema,
  uuidSchema,
} from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { runAfterResponse } from "../../core/after-response.js";
import { config } from "../../core/config.js";
import { validate } from "../../core/http.js";
import { llm } from "../../core/llm/providers/gateway.provider.js";
import { consumeLlmCall } from "../../core/rate-limit/rate-limit.middleware.js";
import { groupRepository } from "./group.repository.js";
import { GroupService } from "./group.service.js";

const service = new GroupService(groupRepository, {
  llm,
  decisionModel: config.llmDecisionModel,
  runAfterResponse,
  consumeLlmCall,
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

const idParam = validate("param", z.object({ id: uuidSchema }));

export const groupRoutes = new Hono<AuthEnv>()
  .use(auth)

  .get("/", validate("query", listGroupsQuerySchema), async (c) => {
    const user = c.get("user");
    return c.json(await service.list(c.req.valid("query").workspaceId, user.id, user.accessToken));
  })

  .post("/", validate("json", createGroupSchema), async (c) => {
    const user = c.get("user");
    return c.json(await service.create(user.id, c.req.valid("json"), user.accessToken), 201);
  })

  .get("/:id", idParam, async (c) => {
    const user = c.get("user");
    return c.json(await service.get(c.req.valid("param").id, user.id, user.accessToken));
  })

  // Bouton silence du groupe.
  .patch("/:id", idParam, validate("json", updateGroupSchema), async (c) => {
    const user = c.get("user");
    return c.json(
      await service.update(c.req.valid("param").id, user.id, c.req.valid("json"), user.accessToken),
    );
  })

  .get("/:id/messages", idParam, validate("query", cursorPaginationSchema), async (c) => {
    const user = c.get("user");
    return c.json(
      await service.listMessages(
        c.req.valid("param").id,
        user.id,
        c.req.valid("query"),
        user.accessToken,
      ),
    );
  })

  .post("/:id/messages", idParam, validate("json", sendGroupMessageSchema), async (c) => {
    const user = c.get("user");
    return c.json(
      await service.send(c.req.valid("param").id, user.id, c.req.valid("json"), user.accessToken),
      201,
    );
  })

  .post("/:id/read", idParam, async (c) => {
    const user = c.get("user");
    return c.json(await service.markRead(c.req.valid("param").id, user.id, user.accessToken));
  });
