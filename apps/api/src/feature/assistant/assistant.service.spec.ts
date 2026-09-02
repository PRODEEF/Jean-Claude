import type { Conversation, Folder, Suggestion } from "@jc/domain";
import type { LlmProvider } from "../../core/llm/llm.port.js";
import type { IConversationRepository } from "../../domain/conversation/conversation.repository.interface.js";
import { ConversationService } from "../../domain/conversation/conversation.service.js";
import type { IFolderRepository } from "../../domain/folder/folder.repository.interface.js";
import { FolderService } from "../../domain/folder/folder.service.js";
import type { ISuggestionRepository } from "../../domain/suggestion/suggestion.repository.interface.js";
import { SuggestionService } from "../../domain/suggestion/suggestion.service.js";
import type { IUserRepository } from "../../domain/user/user.repository.interface.js";
import { AssistantService } from "./assistant.service.js";

const TOKEN = "access-token";
const USER = "user-1";

/** Les identifiants de dossier voyagent dans la charge utile, validés en UUID. */
const SANTE = "a1b2c3d4-0001-4000-8000-000000000001";
const ASSURANCES = "a1b2c3d4-0002-4000-8000-000000000002";
const INVENTE = "a1b2c3d4-0003-4000-8000-000000000003";

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

function makeConversationRepository(
  overrides: Partial<IConversationRepository> = {},
): IConversationRepository {
  const conversation: Conversation = {
    id: "conv-1",
    kind: "chat",
    title: "Mutuelle santé",
    folderIds: [],
    archivedAt: null,
    lastMessageAt: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
  };

  return {
    findAll: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    findById: jest.fn().mockResolvedValue(conversation),
    findAssistantChannel: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(conversation),
    update: jest.fn().mockResolvedValue(conversation),
    delete: jest.fn().mockResolvedValue(undefined),
    setFolders: jest.fn().mockResolvedValue([]),
    listMessages: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    appendMessage: jest.fn(),
    ...overrides,
  };
}

/** Le tour de dialogue n'est jamais joué ici : seul `assignFolders` est appelé. */
const IDLE_LLM: LlmProvider = {
  name: "gateway",
  model: "anthropic/claude-sonnet-5",
  isSovereign: false,
  complete: jest.fn(),
  stream: jest.fn(),
};

/** Même raison : le périmètre ne se lit qu'au moment d'appeler le moteur. */
const IDLE_USERS: IUserRepository = {
  findById: jest.fn(),
  update: jest.fn(),
  completeOnboarding: jest.fn(),
};

function makeService(
  suggestions: ISuggestionRepository = makeSuggestionRepository(),
  folders: IFolderRepository = makeFolderRepository(),
  conversations: IConversationRepository = makeConversationRepository(),
): AssistantService {
  const suggestionService = new SuggestionService(suggestions);
  const folderService = new FolderService(folders);

  return new AssistantService(
    suggestionService,
    folderService,
    new ConversationService(
      conversations,
      IDLE_LLM,
      suggestionService,
      folderService,
      IDLE_USERS,
    ),
  );
}

function makeFilingSuggestion(payload: Record<string, unknown>): Suggestion {
  return makeSuggestion({ kind: "assign_folders", message: "Je range ça ?", payload });
}

/** Dossiers finalement rattachés à la conversation, dans l'ordre d'appel. */
function assignedFolders(repo: IConversationRepository): string[] {
  const call = (repo.setFolders as jest.Mock).mock.calls[0] as [string, string[], string, string];
  return call[1];
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

  describe("rangement d'une conversation (A.1)", () => {
    it("rattache la conversation aux dossiers existants proposés", async () => {
      const suggestions = makeSuggestionRepository({
        findById: jest
          .fn()
          .mockResolvedValue(
            makeFilingSuggestion({ existingFolderIds: [SANTE, ASSURANCES], newFolderNames: [] }),
          ),
      });
      const folders = makeFolderRepository([
        makeFolder({ id: SANTE, name: "Santé" }),
        makeFolder({ id: ASSURANCES, name: "Assurances" }),
      ]);
      const conversations = makeConversationRepository();

      await makeService(suggestions, folders, conversations).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      // Plusieurs dossiers d'un coup : une conversation n'a pas de parent
      // unique (§5.2, A.1).
      expect(assignedFolders(conversations)).toEqual([SANTE, ASSURANCES]);
      expect(folders.create).not.toHaveBeenCalled();
    });

    it("crée le dossier proposé quand aucun existant ne convient", async () => {
      const suggestions = makeSuggestionRepository({
        findById: jest
          .fn()
          .mockResolvedValue(
            makeFilingSuggestion({ existingFolderIds: [], newFolderNames: ["Assurances"] }),
          ),
      });
      const folders = makeFolderRepository();
      const conversations = makeConversationRepository();

      const resolved = await makeService(suggestions, folders, conversations).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      expect(folders.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({ name: "Assurances", createdByAssistant: true }),
        TOKEN,
      );
      expect(assignedFolders(conversations)).toEqual(["folder-Assurances"]);
      expect(resolved.folders.map((folder) => folder.name)).toEqual(["Assurances"]);
    });

    it("réutilise un dossier homonyme au lieu d'en créer un doublon", async () => {
      const suggestions = makeSuggestionRepository({
        findById: jest
          .fn()
          .mockResolvedValue(
            makeFilingSuggestion({ existingFolderIds: [], newFolderNames: ["assurances"] }),
          ),
      });
      const folders = makeFolderRepository([makeFolder({ id: ASSURANCES, name: "Assurances" })]);
      const conversations = makeConversationRepository();

      await makeService(suggestions, folders, conversations).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      expect(folders.create).not.toHaveBeenCalled();
      expect(assignedFolders(conversations)).toEqual([ASSURANCES]);
    });

    it("accepte un dossier situé profond dans l'arborescence", async () => {
      const suggestions = makeSuggestionRepository({
        findById: jest
          .fn()
          .mockResolvedValue(
            makeFilingSuggestion({ existingFolderIds: [ASSURANCES], newFolderNames: [] }),
          ),
      });
      const intermediaire = "a1b2c3d4-0004-4000-8000-000000000004";
      const folders = makeFolderRepository([
        makeFolder({ id: SANTE, name: "Santé" }),
        makeFolder({ id: intermediaire, name: "Contrats", parentId: SANTE }),
        // Troisième niveau : hors de portée d'un aplatissement à deux niveaux.
        makeFolder({ id: ASSURANCES, name: "Assurances", parentId: intermediaire }),
      ]);
      const conversations = makeConversationRepository();

      await makeService(suggestions, folders, conversations).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      // Un dossier oublié par l'aplatissement passerait pour un identifiant
      // inventé et serait écarté du rangement.
      expect(assignedFolders(conversations)).toEqual([ASSURANCES]);
    });

    it("écarte un identifiant de dossier que le modèle a inventé", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const suggestions = makeSuggestionRepository({
        findById: jest.fn().mockResolvedValue(
          makeFilingSuggestion({
            existingFolderIds: [SANTE, INVENTE],
            newFolderNames: [],
          }),
        ),
      });
      const folders = makeFolderRepository([makeFolder({ id: SANTE, name: "Santé" })]);
      const conversations = makeConversationRepository();

      await makeService(suggestions, folders, conversations).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      // L'identifiant inventé échouerait sur la clé étrangère et emporterait
      // tout le rangement avec lui.
      expect(assignedFolders(conversations)).toEqual([SANTE]);
      jest.restoreAllMocks();
    });

    it("refuse un rangement dont plus aucun dossier n'est applicable", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      const suggestions = makeSuggestionRepository({
        findById: jest
          .fn()
          .mockResolvedValue(
            makeFilingSuggestion({ existingFolderIds: [INVENTE], newFolderNames: [] }),
          ),
      });
      const conversations = makeConversationRepository();

      await expect(
        makeService(suggestions, makeFolderRepository(), conversations).resolve(
          USER,
          "sug-1",
          { action: "accept" },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 422 });

      expect(conversations.setFolders).not.toHaveBeenCalled();
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
