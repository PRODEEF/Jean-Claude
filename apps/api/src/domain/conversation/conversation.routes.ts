import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
  assignFoldersSchema,
  createConversationSchema,
  cursorPaginationSchema,
  sendMessageSchema,
  updateConversationSchema,
  uuidSchema,
  type MessageStreamEvent,
} from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware";
import { validate } from "../../core/http";
import { llm } from "../../core/llm/providers/gateway.provider";
import { suggestionRepository } from "../suggestion/suggestion.repository";
import { SuggestionService } from "../suggestion/suggestion.service";
import { conversationRepository } from "./conversation.repository";
import { ConversationService } from "./conversation.service";

const service = new ConversationService(
  conversationRepository,
  llm,
  new SuggestionService(suggestionRepository),
);

const idParam = validate("param", z.object({ id: uuidSchema }));
const pagination = validate("query", cursorPaginationSchema);

export const conversationRoutes = new Hono<AuthEnv>()
  .use(auth)

  .get("/", pagination, async (c) =>
    c.json(
      await service.list(
        c.get("user").accessToken,
        c.req.valid("query"),
        c.req.query("includeArchived") === "true",
      ),
    ),
  )

  /** Déclaré avant `/:id`, qui capterait sinon `assistant` comme identifiant. */
  .get("/assistant", async (c) => {
    const user = c.get("user");
    return c.json(await service.getOrCreateAssistantChannel(user.id, user.accessToken));
  })

  .get("/:id", idParam, async (c) =>
    c.json(await service.getById(c.req.valid("param").id, c.get("user").accessToken)),
  )

  .post("/", validate("json", createConversationSchema), async (c) => {
    const user = c.get("user");
    return c.json(await service.create(user.id, c.req.valid("json"), user.accessToken), 201);
  })

  .patch("/:id", idParam, validate("json", updateConversationSchema), async (c) =>
    c.json(
      await service.update(c.req.valid("param").id, c.req.valid("json"), c.get("user").accessToken),
    ),
  )

  .delete("/:id", idParam, async (c) => {
    await service.delete(c.req.valid("param").id, c.get("user").accessToken);
    return c.body(null, 204);
  })

  /**
   * Remplace l'ensemble des rattachements. Une conversation peut appartenir à
   * plusieurs dossiers simultanément sans être dupliquée (§5.2, A.1).
   */
  .put("/:id/folders", idParam, validate("json", assignFoldersSchema), async (c) =>
    c.json(
      await service.assignFolders(
        c.req.valid("param").id,
        c.req.valid("json"),
        c.get("user").accessToken,
      ),
    ),
  )

  .get("/:id/messages", idParam, pagination, async (c) =>
    c.json(
      await service.listMessages(
        c.req.valid("param").id,
        c.get("user").accessToken,
        c.req.valid("query"),
      ),
    ),
  )

  .post("/:id/messages", idParam, validate("json", sendMessageSchema), async (c) => {
    const user = c.get("user");
    const events = service.streamMessage(
      c.req.valid("param").id,
      user.id,
      c.req.valid("json"),
      user.accessToken,
    );

    // Le premier événement est tiré avant d'ouvrir le flux : tant que rien n'a
    // été écrit, un échec reste une erreur HTTP classique, traitée comme les
    // autres. Une fois les en-têtes partis, il est trop tard pour un statut.
    const first = await events.next();
    if (first.done) return c.body(null, 204);

    // Empêche un proxy de tamponner le flux, ce qui annulerait tout son
    // intérêt : le texte arriverait d'un bloc à la fin.
    c.header("X-Accel-Buffering", "no");

    return streamSSE(
      c,
      async (sse) => {
        await sse.writeSSE({ data: JSON.stringify(first.value) });
        for await (const event of events) {
          await sse.writeSSE({ data: JSON.stringify(event) });
        }
      },
      async (error, sse) => {
        const event: MessageStreamEvent = {
          type: "error",
          message:
            error instanceof HTTPException
              ? error.message
              : "La génération de la réponse a été interrompue.",
        };
        await sse.writeSSE({ data: JSON.stringify(event) });
      },
    );
  });
