import { Hono } from "hono";
import { z } from "zod";
import { resolveSuggestionSchema, uuidSchema } from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { validate } from "../../core/http.js";
import { llm } from "../../core/llm/providers/gateway.provider.js";
import { conversationRepository } from "../../domain/conversation/conversation.repository.js";
import { ConversationService } from "../../domain/conversation/conversation.service.js";
import { folderRepository } from "../../domain/folder/folder.repository.js";
import { FolderService } from "../../domain/folder/folder.service.js";
import { suggestionRepository } from "../../domain/suggestion/suggestion.repository.js";
import { SuggestionService } from "../../domain/suggestion/suggestion.service.js";
import { userRepository } from "../../domain/user/user.repository.js";
import { AssistantService } from "./assistant.service.js";

const suggestions = new SuggestionService(suggestionRepository);
const folders = new FolderService(folderRepository);

const service = new AssistantService(
  suggestions,
  folders,
  new ConversationService(conversationRepository, llm, suggestions, folders, userRepository),
);

export const assistantRoutes = new Hono<AuthEnv>()
  .use(auth)

  /** Propositions de l'assistant sur le fil d'une conversation, tranchées comprises. */
  .get("/suggestions", validate("query", z.object({ conversationId: uuidSchema })), async (c) =>
    c.json(
      await service.listForConversation(
        c.req.valid("query").conversationId,
        c.get("user").accessToken,
      ),
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
