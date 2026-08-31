import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
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
    @Query(new ZodValidationPipe(cursorPaginationSchema)) pagination: { cursor?: string; limit: number },
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
    @Query(new ZodValidationPipe(cursorPaginationSchema)) pagination: { cursor?: string; limit: number },
  ): Promise<Paginated<Message>> {
    return this.service.listMessages(id, user.accessToken, pagination);
  }

  @Post(":id/messages")
  @ApiOperation({ summary: "Envoyer un message et obtenir la réponse de l'assistant" })
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessage,
  ): Promise<{ userMessage: Message; assistantMessage: Message }> {
    return this.service.sendMessage(id, user.id, body, user.accessToken);
  }
}
