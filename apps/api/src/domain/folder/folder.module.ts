import { Module } from "@nestjs/common";
import { FolderController } from "./folder.controller";
import { FOLDER_REPOSITORY } from "./folder.repository.interface";
import { FolderRepository } from "./folder.repository";
import { FolderService } from "./folder.service";

@Module({
  controllers: [FolderController],
  providers: [
    FolderService,
    // Le service dépend du symbole, jamais de la classe : le Repository est
    // remplaçable par un double en test sans toucher au service.
    { provide: FOLDER_REPOSITORY, useClass: FolderRepository },
  ],
  exports: [FolderService],
})
export class FolderModule {}
