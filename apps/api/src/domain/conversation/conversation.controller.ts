import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  HttpException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import {
  assignFoldersSchema,
  createConversationSchema,
  cursorPaginationSchema,
  sendMessageSchema,
  updateConversationSchema,
  type AssignFolders,
  type Conversation,
  type CreateConversation,
  type Message,
  type MessageStreamEvent,
  type Paginated,
  type SendMessage,
  type UpdateConversation,
} from "@jc/domain";
import { CurrentUser } from "../../core/auth/decorators/current-user.decorator";
import { JwtGuard } from "../../core/auth/guards/jwt.guard";
import type { AuthenticatedUser } from "../../core/auth/types/authenticated-user.types";
import { ZodValidationPipe } from "../../core/validation/zod-validation.pipe";
import { ConversationService } from "./conversation.service";

@ApiTags("conversations")
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller("conversations")
export class ConversationController {
  constructor(private readonly service: ConversationService) {}

  @Get()
  @ApiOperation({ summary: "Lister les conversations, de la plus récente à la plus ancienne" })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(cursorPaginationSchema))
    pagination: { cursor?: string; limit: number },
    @Query("includeArchived") includeArchived?: string,
  ): Promise<Paginated<Conversation>> {
    return this.service.list(user.accessToken, pagination, includeArchived === "true");
  }

  /**
   * Déclaré avant `:id` : Nest résout les routes dans l'ordre de déclaration,
   * et `assistant` serait sinon capté comme un identifiant.
   */
  @Get("assistant")
  @ApiOperation({ summary: "Canal permanent Jean-Claude (créé au premier accès)" })
  getAssistantChannel(@CurrentUser() user: AuthenticatedUser): Promise<Conversation> {
    return this.service.getOrCreateAssistantChannel(user.id, user.accessToken);
  }

  @Get(":id")
  @ApiOperation({ summary: "Détail d'une conversation, avec ses dossiers de rattachement" })
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<Conversation> {
    return this.service.getById(id, user.accessToken);
  }

  @Post()
  @ApiOperation({ summary: "Créer une conversation" })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createConversationSchema)) body: CreateConversation,
  ): Promise<Conversation> {
    return this.service.create(user.id, body, user.accessToken);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Renommer ou archiver une conversation" })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateConversationSchema)) body: UpdateConversation,
  ): Promise<Conversation> {
    return this.service.update(id, body, user.accessToken);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Supprimer une conversation et ses messages" })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.delete(id, user.accessToken);
  }

  @Put(":id/folders")
  @ApiOperation({
    summary: "Rattacher la conversation à un ensemble de dossiers (rangement matriciel)",
    description:
      "Remplace l'ensemble des rattachements. Une conversation peut appartenir à plusieurs " +
      "dossiers simultanément sans être dupliquée (§5.2, A.1).",
  })
  assignFolders(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignFoldersSchema)) body: AssignFolders,
  ): Promise<Conversation> {
    return this.service.assignFolders(id, body, user.accessToken);
  }

  @Get(":id/messages")
  @ApiOperation({ summary: "Messages d'une conversation, du plus ancien au plus récent" })
  listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(cursorPaginationSchema))
    pagination: { cursor?: string; limit: number },
  ): Promise<Paginated<Message>> {
    return this.service.listMessages(id, user.accessToken, pagination);
  }

  @Post(":id/messages")
  @ApiOperation({
    summary: "Envoyer un message et recevoir la réponse de l'assistant en flux",
    description:
      "Répond en Server-Sent Events. Chaque ligne `data:` porte un " +
      "`MessageStreamEvent` : le message de l'utilisateur, puis les fragments " +
      "de la réponse, puis le message assistant persisté.",
  })
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessage,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    // Les en-têtes ne partent qu'au premier événement : tant que rien n'est
    // écrit, un échec reste une erreur HTTP classique, traitée par le filtre
    // global. Une fois le flux commencé, il est trop tard pour un code.
    let started = false;

    const emit = (event: MessageStreamEvent): void => {
      if (!started) {
        // Fastify doit savoir qu'on prend la main sur la réponse, faute de quoi
        // il considère la requête sans réponse.
        reply.hijack();
        reply.raw.writeHead(HttpStatus.OK, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          // Empêche un proxy de tamponner le flux, ce qui annulerait tout son
          // intérêt : le texte arriverait d'un bloc à la fin.
          "X-Accel-Buffering": "no",
        });
        started = true;
      }
      reply.raw.write(`data: ${JSON.stringify(event)}

`);
    };

    try {
      for await (const event of this.service.streamMessage(id, user.id, body, user.accessToken)) {
        emit(event);
      }
    } catch (error) {
      if (!started) throw error;

      emit({
        type: "error",
        message:
          error instanceof HttpException
            ? error.message
            : "La génération de la réponse a été interrompue.",
      });
    } finally {
      if (started) reply.raw.end();
    }
  }
}
