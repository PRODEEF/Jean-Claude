import type { Suggestion } from "@jc/domain";
import type { LlmToolCall } from "../../core/llm/llm.port.js";
import type { ISuggestionRepository } from "./suggestion.repository.interface.js";
import { SuggestionService } from "./suggestion.service.js";

const TOKEN = "access-token";
const USER = "user-1";
const CONVERSATION = "conv-1";
const NOW = "2026-09-01T08:00:00.000Z";

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

      // `suggest_recurring_event` est exposé au modèle mais n'a pas encore de
      // suggestion correspondante (A.11).
      const suggestion = await new SuggestionService(repo).capture(
        USER,
        CONVERSATION,
        makeToolCall(
          { title: "Kiné", startsAt: NOW, rrule: "FREQ=WEEKLY;BYDAY=TU" },
          "suggest_recurring_event",
        ),
        TOKEN,
      );

      expect(suggestion).toBeNull();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("garde les listes d'achats et de tâches distinctes", async () => {
      const repo = makeRepository();

      await new SuggestionService(repo).capture(
        USER,
        CONVERSATION,
        makeToolCall(
          {
            message: "Je te les organise ?",
            lists: [
              { title: "Achats jardin", kind: "shopping", items: [{ title: "Terreau" }] },
              { title: "Travaux jardin", kind: "todo", items: [{ title: "Désherber" }] },
            ],
          },
          "suggest_task_list",
        ),
        TOKEN,
      );

      expect(repo.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({
          kind: "create_task_list",
          message: "Je te les organise ?",
          payload: {
            lists: [
              {
                title: "Achats jardin",
                kind: "shopping",
                items: [{ title: "Terreau", dueAt: null }],
              },
              {
                title: "Travaux jardin",
                kind: "todo",
                items: [{ title: "Désherber", dueAt: null }],
              },
            ],
          },
        }),
        TOKEN,
      );
    });

    it("écarte une échéance illisible sans perdre la liste", async () => {
      const repo = makeRepository();

      await new SuggestionService(repo).capture(
        USER,
        CONVERSATION,
        makeToolCall(
          {
            message: "Je te l'organise ?",
            lists: [
              {
                title: "Travaux jardin",
                kind: "todo",
                items: [{ title: "Désherber", dueAt: "lundi prochain" }],
              },
            ],
          },
          "suggest_task_list",
        ),
        TOKEN,
      );

      // Le modèle laisse parfois l'échéance en clair : la tâche vaut mieux sans
      // date que pas de liste du tout.
      const input = (repo.create as jest.Mock).mock.calls[0]?.[1] as { payload: unknown };
      expect(input.payload).toEqual({
        lists: [
          { title: "Travaux jardin", kind: "todo", items: [{ title: "Désherber", dueAt: null }] },
        ],
      });
    });

    it("ignore une proposition de todoliste sans aucune liste", async () => {
      const repo = makeRepository();

      const suggestion = await new SuggestionService(repo).capture(
        USER,
        CONVERSATION,
        makeToolCall({ message: "Je te les organise ?", lists: [] }, "suggest_task_list"),
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

    it("écarte un identifiant de dossier inventé sans perdre le reste du rangement", async () => {
      const repo = makeRepository();

      await new SuggestionService(repo).capture(
        USER,
        CONVERSATION,
        makeToolCall(
          {
            message: "Je range ça dans Santé ?",
            existingFolderIds: ["Santé", "f8f4c0ec-6f0b-4a9a-8f0f-2f2a7b0d1c3e"],
          },
          "suggest_folders",
        ),
        TOKEN,
      );

      // Le modèle reprend parfois le nom du dossier là où la consigne demandait
      // son identifiant : perdre tout le rangement pour une ligne serait pire
      // que de la laisser de côté.
      expect(repo.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({
          kind: "assign_folders",
          payload: expect.objectContaining({
            existingFolderIds: ["f8f4c0ec-6f0b-4a9a-8f0f-2f2a7b0d1c3e"],
          }),
        }),
        TOKEN,
      );
    });

    it("renonce au rangement quand aucun dossier proposé n'est exploitable", async () => {
      const repo = makeRepository();

      const suggestion = await new SuggestionService(repo).capture(
        USER,
        CONVERSATION,
        makeToolCall(
          { message: "Je range ça dans Santé ?", existingFolderIds: ["Santé"] },
          "suggest_folders",
        ),
        TOKEN,
      );

      // Une carte dont l'acceptation ne rangerait rien serait pire que pas de carte.
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
