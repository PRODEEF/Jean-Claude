import { Module } from "@nestjs/common";
import { ConversationController } from "./conversation.controller";
import { CONVERSATION_REPOSITORY } from "./conversation.repository.interface";
import { ConversationRepository } from "./conversation.repository";
import { ConversationService } from "./conversation.service";

@Module({
  controllers: [ConversationController],
  providers: [
    ConversationService,
    { provide: CONVERSATION_REPOSITORY, useClass: ConversationRepository },
  ],
  exports: [ConversationService],
})
export class ConversationModule {}
