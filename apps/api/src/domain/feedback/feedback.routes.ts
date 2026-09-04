import { Hono } from "hono";
import { z } from "zod";
import { createFeedbackSchema, rateMessageSchema, uuidSchema } from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { validate } from "../../core/http.js";
import { feedbackRepository } from "./feedback.repository.js";
import { FeedbackService } from "./feedback.service.js";

const service = new FeedbackService(feedbackRepository);

/**
 * Jamais atteint depuis l'assistant (§12.1, A.10) : ce sont des gestes
 * utilisateur directs, comme `PATCH /api/me`, pas des suggestions du modèle.
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
  );
