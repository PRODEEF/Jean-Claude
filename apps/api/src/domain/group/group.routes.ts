import { Hono } from "hono";
import { z } from "zod";
import {
  assignGroupFoldersSchema,
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
import { consumeLlmCall, rateLimit } from "../../core/rate-limit/rate-limit.middleware.js";
import { attachmentRepository } from "../attachment/attachment.repository.js";
import { workspaceEventRepository } from "../workspace-event/workspace-event.repository.js";
import { WorkspaceEventService } from "../workspace-event/workspace-event.service.js";
import { workspaceListRepository } from "../workspace-list/workspace-list.repository.js";
import { WorkspaceListService } from "../workspace-list/workspace-list.service.js";
import { groupRepository } from "./group.repository.js";
import { GroupService } from "./group.service.js";

const service = new GroupService(
  groupRepository,
  {
    llm,
    decisionModel: config.llmDecisionModel,
    runAfterResponse,
    consumeLlmCall,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => new Date(),
  },
  new WorkspaceListService(workspaceListRepository),
  attachmentRepository,
  new WorkspaceEventService(workspaceEventRepository),
);

const suggestionParam = validate("param", z.object({ id: uuidSchema, suggestionId: uuidSchema }));

const idParam = validate("param", z.object({ id: uuidSchema }));

export const groupRoutes = new Hono<AuthEnv>()
  .use(auth)

  .get("/", validate("query", listGroupsQuerySchema), async (c) => {
    const user = c.get("user");
    return c.json(await service.list(c.req.valid("query").workspaceId, user.id, user.accessToken));
  })

  // `memberIds` peut être vide : le créateur discute seul.
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

  .put("/:id/folders", idParam, validate("json", assignGroupFoldersSchema), async (c) => {
    const user = c.get("user");
    return c.json(
      await service.assignFolders(
        c.req.valid("param").id,
        user.id,
        c.req.valid("json").folderIds,
        user.accessToken,
      ),
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

  // « Convertir en todoliste » : Jean-Claude propose, un membre accepte (§12.1).
  .post("/:id/extract-list", idParam, rateLimit, async (c) => {
    const user = c.get("user");
    return c.json(
      await service.extractList(c.req.valid("param").id, user.id, user.accessToken),
      201,
    );
  })

  // Listes proposées par Jean-Claude (§12.1) : tout membre accepte ou ignore.
  .get("/:id/suggestions", idParam, async (c) => {
    const user = c.get("user");
    return c.json(
      await service.listSuggestions(c.req.valid("param").id, user.id, user.accessToken),
    );
  })

  .post("/:id/suggestions/:suggestionId/accept", suggestionParam, async (c) => {
    const user = c.get("user");
    const { id, suggestionId } = c.req.valid("param");
    return c.json(await service.acceptSuggestion(id, suggestionId, user.id, user.accessToken));
  })

  .post("/:id/suggestions/:suggestionId/dismiss", suggestionParam, async (c) => {
    const user = c.get("user");
    const { id, suggestionId } = c.req.valid("param");
    return c.json(await service.dismissSuggestion(id, suggestionId, user.id, user.accessToken));
  })

  // Événements proposés par Jean-Claude (§12.1) : tout membre accepte ou ignore.
  .get("/:id/event-suggestions", idParam, async (c) => {
    const user = c.get("user");
    return c.json(
      await service.listEventSuggestions(c.req.valid("param").id, user.id, user.accessToken),
    );
  })

  .post("/:id/event-suggestions/:suggestionId/accept", suggestionParam, async (c) => {
    const user = c.get("user");
    const { id, suggestionId } = c.req.valid("param");
    return c.json(await service.acceptEventSuggestion(id, suggestionId, user.id, user.accessToken));
  })

  .post("/:id/event-suggestions/:suggestionId/dismiss", suggestionParam, async (c) => {
    const user = c.get("user");
    const { id, suggestionId } = c.req.valid("param");
    return c.json(
      await service.dismissEventSuggestion(id, suggestionId, user.id, user.accessToken),
    );
  })

  .post("/:id/read", idParam, async (c) => {
    const user = c.get("user");
    return c.json(await service.markRead(c.req.valid("param").id, user.id, user.accessToken));
  });
