import type { Folder, Suggestion } from "@jc/domain";
import type { IFolderRepository } from "../../domain/folder/folder.repository.interface";
import { FolderService } from "../../domain/folder/folder.service";
import type { ISuggestionRepository } from "../../domain/suggestion/suggestion.repository.interface";
import { SuggestionService } from "../../domain/suggestion/suggestion.service";
import { AssistantService } from "./assistant.service";

const TOKEN = "access-token";
const USER = "user-1";

function makeFolder(overrides: Partial<Folder> & Pick<Folder, "id" | "name">): Folder {
  return {
    parentId: null,
    category: null,
    purpose: "generic",
    color: null,
    position: 0,
    createdByAssistant: false,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

function makeSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: "sug-1",
    kind: "create_project_folders",
    status: "pending",
    conversationId: "conv-1",
    message: "Je te crée un dossier Jardin ?",
    payload: {
      folders: [
        {
          name: "Jardin",
          purpose: "generic",
          children: [
            { name: "ACHAT", purpose: "purchase" },
            { name: "TODO", purpose: "todo" },
          ],
        },
      ],
    },
    createdAt: "2026-09-01T08:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

function makeSuggestionRepository(
  overrides: Partial<ISuggestionRepository> = {},
): ISuggestionRepository {
  return {
    create: jest.fn().mockResolvedValue(makeSuggestion()),
    findById: jest.fn().mockResolvedValue(makeSuggestion()),
    listPending: jest.fn().mockResolvedValue([]),
    markResolved: jest
      .fn()
      .mockImplementation((id: string, status: Suggestion["status"]) =>
        Promise.resolve(makeSuggestion({ id, status })),
      ),
    ...overrides,
  };
}

/**
 * Double avec état : `FolderService.create` relit le dossier parent avant
 * d'accepter un sous-dossier. Un double sans mémoire ferait échouer la
 * création du deuxième niveau pour une raison qui n'existe pas en vrai.
 */
function makeFolderRepository(initial: Folder[] = []): IFolderRepository {
  const store = new Map(initial.map((folder) => [folder.id, folder]));

  return {
    findAll: jest.fn().mockImplementation(() => Promise.resolve([...store.values()])),
    findById: jest.fn().mockImplementation((id: string) => Promise.resolve(store.get(id) ?? null)),
    create: jest
      .fn()
      .mockImplementation(
        (
          _userId: string,
          input: { name: string; parentId?: string | null; purpose?: Folder["purpose"] },
        ) => {
          const folder = makeFolder({
            id: `folder-${input.name}`,
            name: input.name,
            parentId: input.parentId ?? null,
            purpose: input.purpose ?? "generic",
          });
          store.set(folder.id, folder);
          return Promise.resolve(folder);
        },
      ),
    update: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
    countConversations: jest.fn().mockResolvedValue(new Map<string, number>()),
  };
}

function makeService(
  suggestions: ISuggestionRepository = makeSuggestionRepository(),
  folders: IFolderRepository = makeFolderRepository(),
): AssistantService {
  return new AssistantService(new SuggestionService(suggestions), new FolderService(folders));
}

/** Noms des dossiers créés, dans l'ordre, avec leur parent. */
function createdFolders(repo: IFolderRepository): { name: string; parentId: string | null }[] {
  return (repo.create as jest.Mock).mock.calls.map((call) => {
    const input = call[1] as { name: string; parentId: string | null };
    return { name: input.name, parentId: input.parentId };
  });
}

describe("AssistantService", () => {
  describe("acceptation d'une proposition", () => {
    it("crée le dossier racine puis ses sous-dossiers", async () => {
      const folders = makeFolderRepository();

      await makeService(makeSuggestionRepository(), folders).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      expect(createdFolders(folders)).toEqual([
        { name: "Jardin", parentId: null },
        { name: "ACHAT", parentId: "folder-Jardin" },
        { name: "TODO", parentId: "folder-Jardin" },
      ]);
    });

    it("marque les dossiers créés comme venant de l'assistant", async () => {
      const folders = makeFolderRepository();

      await makeService(makeSuggestionRepository(), folders).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      for (const call of (folders.create as jest.Mock).mock.calls) {
        expect(call[1]).toMatchObject({ createdByAssistant: true });
      }
    });

    it("passe la proposition en acceptée", async () => {
      const suggestions = makeSuggestionRepository();

      const resolved = await makeService(suggestions).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      expect(suggestions.markResolved).toHaveBeenCalledWith("sug-1", "accepted", TOKEN);
      expect(resolved.suggestion.status).toBe("accepted");
    });

    it("ne recrée pas un dossier déjà présent, et complète ce qui manque", async () => {
      const folders = makeFolderRepository([
        makeFolder({ id: "existing-jardin", name: "jardin" }),
        makeFolder({ id: "existing-achat", name: "ACHAT", parentId: "existing-jardin" }),
      ]);

      const resolved = await makeService(makeSuggestionRepository(), folders).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      // « jardin » et « ACHAT » existent déjà : seul « TODO » est à créer, sous
      // le dossier retrouvé.
      expect(createdFolders(folders)).toEqual([{ name: "TODO", parentId: "existing-jardin" }]);
      expect(resolved.folders.map((folder) => folder.name)).toEqual(["TODO"]);
    });

    it("refuse une proposition dont la charge utile n'est plus lisible", async () => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      const folders = makeFolderRepository();
      const suggestions = makeSuggestionRepository({
        findById: jest.fn().mockResolvedValue(makeSuggestion({ payload: { folders: [] } })),
      });

      await expect(
        makeService(suggestions, folders).resolve(USER, "sug-1", { action: "accept" }, TOKEN),
      ).rejects.toMatchObject({ status: 422 });

      expect(folders.create).not.toHaveBeenCalled();
      expect(suggestions.markResolved).not.toHaveBeenCalled();
      jest.restoreAllMocks();
    });
  });

  describe("refus d'une proposition", () => {
    it("ne crée aucun dossier", async () => {
      const folders = makeFolderRepository();
      const suggestions = makeSuggestionRepository();

      const resolved = await makeService(suggestions, folders).resolve(
        USER,
        "sug-1",
        { action: "dismiss" },
        TOKEN,
      );

      expect(folders.create).not.toHaveBeenCalled();
      expect(suggestions.markResolved).toHaveBeenCalledWith("sug-1", "dismissed", TOKEN);
      expect(resolved.folders).toEqual([]);
    });
  });

  describe("propositions en attente", () => {
    it("refuse de traiter une proposition introuvable", async () => {
      const suggestions = makeSuggestionRepository({ findById: jest.fn().mockResolvedValue(null) });

      await expect(
        makeService(suggestions).resolve(USER, "sug-1", { action: "accept" }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("liste celles du fil demandé", async () => {
      const pending = [makeSuggestion()];
      const suggestions = makeSuggestionRepository({
        listPending: jest.fn().mockResolvedValue(pending),
      });

      await expect(makeService(suggestions).listPending("conv-1", TOKEN)).resolves.toEqual(pending);
      expect(suggestions.listPending).toHaveBeenCalledWith("conv-1", TOKEN);
    });
  });
});
