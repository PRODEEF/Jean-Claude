import {
  createProjectFoldersPayloadSchema,
  type Folder,
  type ResolveSuggestion,
  type Suggestion,
} from "@jc/domain";
import { httpError } from "../../core/http";
import type { FolderService } from "../../domain/folder/folder.service";
import type { SuggestionService } from "../../domain/suggestion/suggestion.service";

export type ResolvedSuggestion = {
  suggestion: Suggestion;
  /** Dossiers réellement créés — vide sur un refus, ou si tout existait déjà. */
  folders: Folder[];
};

/**
 * Cas d'usage du canal permanent : ce que devient une proposition de
 * l'assistant quand l'utilisateur y répond (§12.1, A.4).
 *
 * Vit dans `feature/` et non dans `domain/` parce qu'il compose deux entités —
 * la suggestion et le dossier. C'est le seul endroit où une proposition se
 * transforme en données.
 */
export class AssistantService {
  constructor(
    private readonly suggestions: SuggestionService,
    private readonly folders: FolderService,
  ) {}

  listPending(conversationId: string, accessToken: string): Promise<Suggestion[]> {
    return this.suggestions.listPending(conversationId, accessToken);
  }

  async resolve(
    userId: string,
    id: string,
    input: ResolveSuggestion,
    accessToken: string,
  ): Promise<ResolvedSuggestion> {
    const suggestion = await this.suggestions.requirePending(id, accessToken);

    if (input.action === "dismiss") {
      return {
        suggestion: await this.suggestions.markResolved(id, "dismissed", accessToken),
        folders: [],
      };
    }

    const folders = await this.createFolders(userId, suggestion, accessToken);

    return {
      suggestion: await this.suggestions.markResolved(id, "accepted", accessToken),
      folders,
    };
  }

  /**
   * Crée l'arborescence proposée, en passant sur ce qui existe déjà.
   *
   * Le pré-contrôle évite de heurter la contrainte d'unicité de `folders`, qui
   * sortirait en 500 après avoir laissé derrière elle les dossiers du début du
   * lot. L'acceptation devient de ce fait rejouable : ce qui manque est créé,
   * le reste est laissé en place.
   */
  private async createFolders(
    userId: string,
    suggestion: Suggestion,
    accessToken: string,
  ): Promise<Folder[]> {
    const payload = createProjectFoldersPayloadSchema.safeParse(suggestion.payload);

    if (!payload.success) {
      // La charge utile a été validée à la capture : échouer ici signifie que
      // le contrat a changé depuis. Le détail reste côté serveur.
      console.error("Charge utile de suggestion illisible", suggestion.id);
      throw httpError(422, "Cette proposition n'est plus exploitable.");
    }

    const tree = await this.folders.getTree(accessToken);
    const created: Folder[] = [];

    for (const proposed of payload.data.folders) {
      const existing = tree.find((node) => sameName(node.name, proposed.name));

      const root =
        existing ??
        (await this.folders.create(
          userId,
          {
            name: proposed.name,
            parentId: null,
            purpose: proposed.purpose,
            createdByAssistant: true,
          },
          accessToken,
        ));

      if (!existing) created.push(root);

      for (const child of proposed.children) {
        if (existing?.children.some((node) => sameName(node.name, child.name))) continue;

        created.push(
          await this.folders.create(
            userId,
            {
              name: child.name,
              parentId: root.id,
              purpose: child.purpose,
              createdByAssistant: true,
            },
            accessToken,
          ),
        );
      }
    }

    return created;
  }
}

/**
 * Deux dossiers portant le même nom à la casse près sont considérés comme le
 * même. Postgres, lui, les accepterait tous les deux : c'est l'utilisateur
 * qu'on protège ici, pas la base — « Jardin » et « jardin » côte à côte dans la
 * barre latérale ne se distinguent pas d'un doublon.
 */
function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("fr") === b.trim().toLocaleLowerCase("fr");
}
