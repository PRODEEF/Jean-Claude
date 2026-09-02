import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
  assignFoldersSchema,
  createConversationSchema,
  cursorPaginationSchema,
  editMessageSchema,
  sendMessageSchema,
  updateConversationSchema,
  uuidSchema,
  type MessageStreamEvent,
} from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { validate } from "../../core/http.js";
import { llm } from "../../core/llm/providers/gateway.provider.js";
import { calendarRepository } from "../calendar/calendar.repository.js";
import { CalendarService } from "../calendar/calendar.service.js";
import { folderRepository } from "../folder/folder.repository.js";
import { FolderService } from "../folder/folder.service.js";
import { suggestionRepository } from "../suggestion/suggestion.repository.js";
import { SuggestionService } from "../suggestion/suggestion.service.js";
import { userRepository } from "../user/user.repository.js";
import { conversationRepository } from "./conversation.repository.js";
import { ConversationService } from "./conversation.service.js";

const service = new ConversationService(
  conversationRepository,
  llm,
  new SuggestionService(suggestionRepository),
  new FolderService(folderRepository),
  userRepository,
  new CalendarService(calendarRepository),
);

const idParam = validate("param", z.object({ id: uuidSchema }));
const messageParam = validate("param", z.object({ id: uuidSchema, messageId: uuidSchema }));
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

  .post("/:id/messages", idParam, validate("json", sendMessageSchema), (c) => {
    const user = c.get("user");
    return streamTurn(
      c,
      service.streamMessage(
        c.req.valid("param").id,
        user.id,
        c.req.valid("json"),
        user.accessToken,
      ),
    );
  })

  /**
   * Corrige un message envoyé, et rejoue le tour à partir de là.
   *
   * `PUT` et non `PATCH` : le texte est remplacé en entier, et la suite du fil
   * — qui répondait à l'ancien — disparaît avec lui.
   */
  .put("/:id/messages/:messageId", messageParam, validate("json", editMessageSchema), (c) => {
    const user = c.get("user");
    const { id, messageId } = c.req.valid("param");
    return streamTurn(
      c,
      service.editMessage(id, user.id, messageId, c.req.valid("json"), user.accessToken),
    );
  })

  /** Redemande une réponse au modèle sur ce point du fil. */
  .post("/:id/messages/:messageId/retry", messageParam, (c) => {
    const user = c.get("user");
    const { id, messageId } = c.req.valid("param");
    return streamTurn(c, service.retryMessage(id, user.id, messageId, user.accessToken));
  })

  /**
   * Ouvre la conversation dédiée que le canal permanent a proposée (A.10).
   *
   * `201` : la validation de l'utilisateur crée bien une conversation, et c'est
   * elle que le client ouvre ensuite avec la question restée sans réponse.
   */
  .post("/:id/messages/:messageId/switch", messageParam, async (c) => {
    const user = c.get("user");
    const { id, messageId } = c.req.valid("param");
    return c.json(
      await service.switchToDedicatedConversation(id, user.id, messageId, user.accessToken),
      201,
    );
  });

/**
 * Rend un tour de dialogue en Server-Sent Events.
 *
 * Partagé par l'envoi, la correction et la reprise : les trois produisent la
 * même suite d'événements, seule diffère la façon dont le fil y arrive.
 */
async function streamTurn(
  c: Context<AuthEnv>,
  events: AsyncGenerator<MessageStreamEvent>,
): Promise<Response> {
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
}
