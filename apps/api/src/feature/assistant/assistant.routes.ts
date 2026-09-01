import { Hono } from "hono";
import { z } from "zod";
import { resolveSuggestionSchema, uuidSchema } from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware";
import { validate } from "../../core/http";
import { folderRepository } from "../../domain/folder/folder.repository";
import { FolderService } from "../../domain/folder/folder.service";
import { suggestionRepository } from "../../domain/suggestion/suggestion.repository";
import { SuggestionService } from "../../domain/suggestion/suggestion.service";
import { AssistantService } from "./assistant.service";

const service = new AssistantService(
  new SuggestionService(suggestionRepository),
  new FolderService(folderRepository),
);

export const assistantRoutes = new Hono<AuthEnv>()
  .use(auth)

  /** Propositions encore en attente d'un geste, pour le fil d'une conversation. */
  .get("/suggestions", validate("query", z.object({ conversationId: uuidSchema })), async (c) =>
    c.json(
      await service.listPending(c.req.valid("query").conversationId, c.get("user").accessToken),
    ),
  )

  .post(
    "/suggestions/:id/resolve",
    validate("param", z.object({ id: uuidSchema })),
    validate("json", resolveSuggestionSchema),
    async (c) => {
      const user = c.get("user");
      return c.json(
        await service.resolve(
          user.id,
          c.req.valid("param").id,
          c.req.valid("json"),
          user.accessToken,
        ),
      );
    },
  );
