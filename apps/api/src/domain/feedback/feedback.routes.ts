import { Hono } from "hono";
import { z } from "zod";
import {
  createFeedbackSchema,
  rateMessageSchema,
  updateFeedbackStatusSchema,
  uuidSchema,
} from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { validate } from "../../core/http.js";
import { llm } from "../../core/llm/providers/gateway.provider.js";
import { rateLimit } from "../../core/rate-limit/rate-limit.middleware.js";
import { feedbackRepository } from "./feedback.repository.js";
import { FeedbackService } from "./feedback.service.js";

const service = new FeedbackService(feedbackRepository, llm);

/**
 * Envoi : jamais atteint depuis l'assistant (§12.1, A.10) — ce sont des gestes
 * utilisateur directs, comme `PATCH /api/me`, pas des suggestions du modèle.
 * Le canal permanent écrit, lui, par `AssistantService` une fois la
 * proposition acceptée.
 */
export const feedbackRoutes = new Hono<AuthEnv>()
  .use(auth)

  .post("/", validate("json", createFeedbackSchema), async (c) => {
    const user = c.get("user");
    return c.json(await service.submitGeneral(user.id, c.req.valid("json"), user.accessToken), 201);
  })

  .post(
    "/messages/:messageId/rating",
    validate("param", z.object({ messageId: uuidSchema })),
    validate("json", rateMessageSchema),
    async (c) => {
      const user = c.get("user");
      const { messageId } = c.req.valid("param");
      return c.json(
        await service.rateMessage(user.id, messageId, c.req.valid("json"), user.accessToken),
        201,
      );
    },
  )

  // Revue par l'équipe : le service refuse quiconque n'est pas admin.
  .get("/review", async (c) => {
    return c.json(await service.listByTester(c.get("user").accessToken));
  })

  .post("/review/analysis", rateLimit, async (c) => {
    return c.json(await service.analyzeNew(c.get("user").accessToken));
  })

  .patch(
    "/review/:id",
    validate("param", z.object({ id: uuidSchema })),
    validate("json", updateFeedbackStatusSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const { status } = c.req.valid("json");
      return c.json(await service.updateStatus(id, status, c.get("user").accessToken));
    },
  );
