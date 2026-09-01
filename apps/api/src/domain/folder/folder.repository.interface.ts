import type { CreateFolder, Folder, UpdateFolder } from "@jc/domain";

export interface IFolderRepository {
  findAll(accessToken: string): Promise<Folder[]>;
  findById(id: string, accessToken: string): Promise<Folder | null>;
  /**
   * `createdByAssistant` n'appartient pas à `CreateFolder` : le drapeau est
   * posé par le serveur quand l'utilisateur accepte une proposition (A.4), il
   * n'est jamais accepté d'un client.
   */
  create(
    userId: string,
    input: CreateFolder & { createdByAssistant?: boolean },
    accessToken: string,
  ): Promise<Folder>;
  update(id: string, patch: UpdateFolder, accessToken: string): Promise<Folder>;
  delete(id: string, accessToken: string): Promise<void>;
  /** Compte les conversations rattachées, par dossier — alimente la sidebar. */
  countConversations(accessToken: string): Promise<Map<string, number>>;
}
