import { MAX_FOLDER_DEPTH } from "@jc/domain";
import type { CreateFolder, Folder, FolderTreeNode, UpdateFolder } from "@jc/domain";
import { httpError } from "../../core/http.js";
import type { IFolderRepository } from "./folder.repository.interface.js";

export class FolderService {
  constructor(private readonly folders: IFolderRepository) {}

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

    const childrenByParent = new Map<string | null, Folder[]>();
    for (const folder of all) {
      const siblings = childrenByParent.get(folder.parentId) ?? [];
      siblings.push(folder);
      childrenByParent.set(folder.parentId, siblings);
    }

    const build = (folder: Folder): FolderTreeNode => {
      const children = (childrenByParent.get(folder.id) ?? []).map(build);
      // Le compteur d'un dossier inclut tout ce que contiennent ses
      // descendants, à n'importe quelle profondeur : l'utilisateur raisonne en
      // « ce que contient Santé », pas en « ce qui est directement à sa
      // racine ». La somme porte sur les compteurs déjà agrégés des enfants,
      // ce qui remonte l'arbre entier sans le reparcourir.
      const own = counts.get(folder.id) ?? 0;
      const inherited = children.reduce((sum, child) => sum + child.conversationCount, 0);
      return { ...folder, children, conversationCount: own + inherited };
    };

    return (childrenByParent.get(null) ?? []).map(build);
  }

  async create(userId: string, input: CreateFolder, accessToken: string): Promise<Folder> {
    if (input.parentId) {
      const all = await this.folders.findAll(accessToken);
      const parentOf = parentMap(all);

      if (!parentOf.has(input.parentId)) throw httpError(404, "Dossier parent introuvable.");

      // Le dossier créé se pose juste sous son parent et n'a encore aucun
      // descendant : il n'occupe qu'un niveau de plus.
      assertWithinDepth(depthOf(input.parentId, parentOf) + 1);
    }

    return this.folders.create(userId, input, accessToken);
  }

  /**
   * Modifie un dossier — et, si `parentId` change, le déplace.
   *
   * Les deux règles d'arborescence sont vérifiées ici en plus du trigger SQL.
   * Doublon volontaire : la base reste le garde-fou ultime, elle vaut quel que
   * soit le chemin d'écriture, mais un 400 lisible vaut mieux qu'une erreur
   * Postgres brute remontée en 500.
   */
  async update(id: string, patch: UpdateFolder, accessToken: string): Promise<Folder> {
    // `null` remonte le dossier à la racine : ni boucle ni dépassement possible.
    if (patch.parentId) {
      const all = await this.folders.findAll(accessToken);
      const parentOf = parentMap(all);

      if (!parentOf.has(patch.parentId)) throw httpError(404, "Dossier parent introuvable.");

      if (patch.parentId === id) {
        throw httpError(400, "Un dossier ne peut pas être rangé sous lui-même.");
      }

      // Tant que l'arborescence tenait en 2 niveaux, aucune boucle n'était
      // formable. À 5, ranger un dossier sous l'un de ses propres descendants
      // referme une chaîne que toute descente parcourrait indéfiniment.
      if (ancestorsOf(patch.parentId, parentOf).includes(id)) {
        throw httpError(
          400,
          "Un dossier ne peut pas être rangé sous l'un de ses propres sous-dossiers.",
        );
      }

      // Un dossier déplacé emmène ses sous-dossiers avec lui : c'est le point
      // le plus profond de la branche qui décide, pas le dossier lui-même. Le
      // trigger SQL ne le voit pas — il ne juge que la ligne écrite, et celles
      // des descendants ne sont pas touchées.
      assertWithinDepth(depthOf(patch.parentId, parentOf) + heightOf(id, all));
    }

    return this.folders.update(id, patch, accessToken);
  }

  /**
   * Supprime un dossier.
   *
   * Les conversations rattachées ne sont pas supprimées : seule la liaison
   * disparaît (cascade sur `conversation_folders`). C'est la conséquence
   * directe du rangement matriciel — une conversation vit indépendamment des
   * dossiers qui la référencent (A.1). Les sous-dossiers, eux, suivent leur
   * parent : ils lui appartiennent (cascade sur `folders.parent_id`).
   */
  async delete(id: string, accessToken: string): Promise<void> {
    const folder = await this.folders.findById(id, accessToken);
    if (!folder) throw httpError(404, "Dossier introuvable.");
    await this.folders.delete(id, accessToken);
  }
}

function parentMap(folders: Folder[]): Map<string, string | null> {
  return new Map(folders.map((folder) => [folder.id, folder.parentId]));
}

/**
 * Identifiants des dossiers situés au-dessus de `id`, du plus proche au plus
 * lointain.
 *
 * L'ensemble `seen` fait terminer la remontée même si la base portait déjà une
 * boucle, héritée d'un état antérieur au trigger. Sans lui, elle bouclerait.
 */
function ancestorsOf(id: string, parentOf: Map<string, string | null>): string[] {
  const chain: string[] = [];
  const seen = new Set<string>([id]);
  let current = parentOf.get(id) ?? null;

  while (current !== null && !seen.has(current)) {
    chain.push(current);
    seen.add(current);
    current = parentOf.get(current) ?? null;
  }

  return chain;
}

/** Niveau du dossier : 1 pour un dossier racine. */
function depthOf(id: string, parentOf: Map<string, string | null>): number {
  return ancestorsOf(id, parentOf).length + 1;
}

/** Nombre de niveaux qu'occupe la branche partant de `id`, ce dossier compris. */
function heightOf(id: string, folders: Folder[]): number {
  const childrenOf = new Map<string, string[]>();
  for (const folder of folders) {
    if (folder.parentId === null) continue;
    childrenOf.set(folder.parentId, [...(childrenOf.get(folder.parentId) ?? []), folder.id]);
  }

  const walk = (nodeId: string, seen: Set<string>): number => {
    if (seen.has(nodeId)) return 0;
    seen.add(nodeId);
    const children = childrenOf.get(nodeId) ?? [];
    return 1 + Math.max(0, ...children.map((child) => walk(child, seen)));
  };

  return walk(id, new Set());
}

function assertWithinDepth(depth: number): void {
  if (depth > MAX_FOLDER_DEPTH) {
    throw httpError(
      400,
      `L'arborescence est limitée à ${MAX_FOLDER_DEPTH} niveaux : ce dossier ne peut pas descendre plus bas.`,
    );
  }
}
