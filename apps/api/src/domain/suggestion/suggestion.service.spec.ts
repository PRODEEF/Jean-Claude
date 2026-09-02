import type { Suggestion } from "@jc/domain";
import type { LlmToolCall } from "../../core/llm/llm.port.js";
import type { ISuggestionRepository } from "./suggestion.repository.interface.js";
import { SuggestionService } from "./suggestion.service.js";

const TOKEN = "access-token";
const USER = "user-1";
const CONVERSATION = "conv-1";

function makeSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: "sug-1",
    kind: "create_project_folders",
    status: "pending",
    conversationId: CONVERSATION,
    message: "Je te crée un dossier Jardin ?",
    payload: { folders: [{ name: "Jardin", purpose: "generic", children: [] }] },
    createdAt: "2026-09-01T08:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

function makeRepository(overrides: Partial<ISuggestionRepository> = {}): ISuggestionRepository {
  return {
    create: jest.fn().mockResolvedValue(makeSuggestion()),
    findById: jest.fn().mockResolvedValue(makeSuggestion()),
    listPending: jest.fn().mockResolvedValue([]),
    listForConversation: jest.fn().mockResolvedValue([]),
    markResolved: jest.fn().mockResolvedValue(makeSuggestion({ status: "accepted" })),
    ...overrides,
  };
}

function makeToolCall(
  input: Record<string, unknown>,
  name = "suggest_project_folders",
): LlmToolCall {
  return { id: "call-1", name, input };
}

/** Les appels inexploitables sont consignés : on vérifie le comportement, pas le log. */
beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("SuggestionService", () => {
  describe("capture", () => {
    it("transforme un appel d'outil en suggestion en attente", async () => {
      const repo = makeRepository();

      await new SuggestionService(repo).capture(
        USER,
        CONVERSATION,
        makeToolCall({
          message: "Je te crée un dossier Jardin avec IDÉE et ACHAT dedans ?",
          folders: [
            {
              name: "Jardin",
              children: [
                { name: "IDÉE", purpose: "idea" },
                { name: "ACHAT", purpose: "purchase" },
              ],
            },
          ],
        }),
        TOKEN,
      );

      expect(repo.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({
          conversationId: CONVERSATION,
          kind: "create_project_folders",
          message: "Je te crée un dossier Jardin avec IDÉE et ACHAT dedans ?",
        }),
        TOKEN,
      );
    });

    it("complète les champs omis par le modèle", async () => {
      const repo = makeRepository();

      await new SuggestionService(repo).capture(
        USER,
        CONVERSATION,
        makeToolCall({ message: "Je te crée un dossier Jardin ?", folders: [{ name: "Jardin" }] }),
        TOKEN,
      );

      const input = (repo.create as jest.Mock).mock.calls[0]?.[1] as { payload: unknown };
      expect(input.payload).toEqual({
        folders: [{ name: "Jardin", purpose: "generic", children: [] }],
      });
    });

    it("ignore un appel d'outil qui ne correspond à aucune suggestion", async () => {
      const repo = makeRepository();

      const suggestion = await new SuggestionService(repo).capture(
        USER,
        CONVERSATION,
        makeToolCall({ lists: [] }, "suggest_task_list"),
        TOKEN,
      );

      expect(suggestion).toBeNull();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("ignore une proposition sans dossier : il n'y aurait rien à créer", async () => {
      const repo = makeRepository();

      const suggestion = await new SuggestionService(repo).capture(
        USER,
        CONVERSATION,
        makeToolCall({ message: "Je range ça ?", folders: [] }),
        TOKEN,
      );

      expect(suggestion).toBeNull();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("ignore une proposition sans phrase à afficher à l'utilisateur", async () => {
      const repo = makeRepository();

      const suggestion = await new SuggestionService(repo).capture(
        USER,
        CONVERSATION,
        makeToolCall({ message: "   ", folders: [{ name: "Jardin" }] }),
        TOKEN,
      );

      expect(suggestion).toBeNull();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("ignore un sous-dossier qui porterait lui-même des enfants", async () => {
      const repo = makeRepository();

      const suggestion = await new SuggestionService(repo).capture(
        USER,
        CONVERSATION,
        makeToolCall({
          message: "Je te crée cette arborescence ?",
          folders: [
            { name: "Maison", children: [{ name: "Jardin", children: [{ name: "Outils" }] }] },
          ],
        }),
        TOKEN,
      );

      expect(suggestion).toBeNull();
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe("requirePending", () => {
    it("refuse une proposition introuvable", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(null) });

      await expect(
        new SuggestionService(repo).requirePending("sug-1", TOKEN),
      ).rejects.toMatchObject({
        status: 404,
      });
    });

    it("refuse une proposition déjà traitée", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeSuggestion({ status: "dismissed" })),
      });

      await expect(
        new SuggestionService(repo).requirePending("sug-1", TOKEN),
      ).rejects.toMatchObject({
        status: 409,
      });
    });
  });

  describe("markResolved", () => {
    it("marque la proposition du statut demandé", async () => {
      const repo = makeRepository();

      await new SuggestionService(repo).markResolved("sug-1", "dismissed", TOKEN);

      expect(repo.markResolved).toHaveBeenCalledWith("sug-1", "dismissed", TOKEN);
    });

    it("ne retraite pas une proposition déjà résolue", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeSuggestion({ status: "accepted" })),
      });

      await expect(
        new SuggestionService(repo).markResolved("sug-1", "dismissed", TOKEN),
      ).rejects.toMatchObject({ status: 409 });
      expect(repo.markResolved).not.toHaveBeenCalled();
    });
  });
});
