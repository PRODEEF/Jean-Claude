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
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  createFolderSchema,
  updateFolderSchema,
  type CreateFolder,
  type Folder,
  type FolderTreeNode,
  type UpdateFolder,
} from "@jc/domain";
import { CurrentUser } from "../../core/auth/decorators/current-user.decorator";
import { JwtGuard } from "../../core/auth/guards/jwt.guard";
import type { AuthenticatedUser } from "../../core/auth/types/authenticated-user.types";
import { ZodValidationPipe } from "../../core/validation/zod-validation.pipe";
import { FolderService } from "./folder.service";

@ApiTags("folders")
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller("folders")
export class FolderController {
  constructor(private readonly service: FolderService) {}

  @Get()
  @ApiOperation({ summary: "Arborescence des dossiers avec compteurs de conversations" })
  getTree(@CurrentUser() user: AuthenticatedUser): Promise<FolderTreeNode[]> {
    return this.service.getTree(user.accessToken);
  }

  @Post()
  @ApiOperation({ summary: "Créer un dossier (ou un sous-dossier)" })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createFolderSchema)) body: CreateFolder,
  ): Promise<Folder> {
    return this.service.create(user.id, body, user.accessToken);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Renommer, recolorer ou déplacer un dossier" })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateFolderSchema)) body: UpdateFolder,
  ): Promise<Folder> {
    return this.service.update(id, body, user.accessToken);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Supprimer un dossier (les conversations sont conservées)" })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.delete(id, user.accessToken);
  }
}
