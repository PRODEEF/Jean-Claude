import type { CreateFolder, Folder, UpdateFolder } from "@jc/domain";

export interface IFolderRepository {
  findAll(accessToken: string): Promise<Folder[]>;
  findById(id: string, accessToken: string): Promise<Folder | null>;
  create(userId: string, input: CreateFolder, accessToken: string): Promise<Folder>;
  update(id: string, patch: UpdateFolder, accessToken: string): Promise<Folder>;
  delete(id: string, accessToken: string): Promise<void>;
  /** Compte les conversations rattachées, par dossier — alimente la sidebar. */
  countConversations(accessToken: string): Promise<Map<string, number>>;
}

export const FOLDER_REPOSITORY = Symbol("IFolderRepository");
