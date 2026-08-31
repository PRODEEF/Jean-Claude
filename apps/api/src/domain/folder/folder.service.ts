import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateFolder, Folder, FolderTreeNode, UpdateFolder } from "@jc/domain";
import { FOLDER_REPOSITORY, type IFolderRepository } from "./folder.repository.interface";

@Injectable()
export class FolderService {
  constructor(
    @Inject(FOLDER_REPOSITORY) private readonly folders: IFolderRepository,
  ) {}

  /**
   * Arborescence complète, prête à l'affichage.
   *
   * Assemblée côté serveur plutôt que par chaque client : la sidebar web, le
   * tiroir mobile et le desktop doivent présenter exactement le même ordre et
   * les mêmes compteurs (§5.3 — pas de logique métier dupliquée).
   */
  async getTree(accessToken: string): Promise<FolderTreeNode[]> {
    const [all, counts] = await Promise.all([
      this.folders.findAll(accessToken),
      this.folders.countConversations(accessToken),
    ]);

    const childrenByParent = new Map<string, Folder[]>();
    for (const folder of all) {
      if (folder.parentId === null) continue;
      const siblings = childrenByParent.get(folder.parentId) ?? [];
      siblings.push(folder);
      childrenByParent.set(folder.parentId, siblings);
    }

    return all
      .filter((folder) => folder.parentId === null)
      .map((folder) => {
        const children = childrenByParent.get(folder.id) ?? [];
        // Le compteur d'un dossier racine inclut les conversations de ses
        // sous-dossiers : l'utilisateur raisonne en « ce que contient Santé »,
        // pas en « ce qui est directement à la racine de Santé ».
        const own = counts.get(folder.id) ?? 0;
        const inherited = children.reduce((sum, c) => sum + (counts.get(c.id) ?? 0), 0);
        return { ...folder, children, conversationCount: own + inherited };
      });
  }

  async create(userId: string, input: CreateFolder, accessToken: string): Promise<Folder> {
    if (input.parentId) {
      const parent = await this.folders.findById(input.parentId, accessToken);
      if (!parent) throw new NotFoundException("Dossier parent introuvable.");
      // Doublon volontaire du trigger SQL : la contrainte base reste le garde-fou
      // ultime, mais un message clair vaut mieux qu'une erreur Postgres brute.
      if (parent.parentId !== null) {
        throw new BadRequestException(
          "L'arborescence est limitée à 2 niveaux : ce dossier ne peut pas accueillir de sous-dossier.",
        );
      }
    }
    return this.folders.create(userId, input, accessToken);
  }

  async update(id: string, patch: UpdateFolder, accessToken: string): Promise<Folder> {
    return this.folders.update(id, patch, accessToken);
  }

  /**
   * Supprime un dossier.
   *
   * Les conversations rattachées ne sont pas supprimées : seule la liaison
   * disparaît (cascade sur `conversation_folders`). C'est la conséquence
   * directe du rangement matriciel — une conversation vit indépendamment des
   * dossiers qui la référencent (A.1).
   */
  async delete(id: string, accessToken: string): Promise<void> {
    const folder = await this.folders.findById(id, accessToken);
    if (!folder) throw new NotFoundException("Dossier introuvable.");
    await this.folders.delete(id, accessToken);
  }
}
