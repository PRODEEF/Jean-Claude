import type { CreateFeedback, Feedback, MessageRating, RateMessage } from "@jc/domain";
import type { LlmProvider } from "../../core/llm/llm.port.js";
import { FeedbackService } from "./feedback.service.js";
import type {
  AuthoredFeedback,
  AuthoredRating,
  IFeedbackRepository,
} from "./feedback.repository.interface.js";

const TOKEN = "access-token";
const NICOLAS = "22222222-2222-4222-8222-222222222222";
const LEA = "33333333-3333-4333-8333-333333333333";

function makeFeedback(overrides: Partial<Feedback> = {}): Feedback {
  return {
    id: "fb-1",
    category: "bug",
    content: "Le bouton d'envoi reste grisé après une erreur réseau.",
    platform: "web",
    screen: "/assistant",
    status: "new",
    createdAt: "2026-09-04T09:00:00.000Z",
    ...overrides,
  };
}

function makeMessageRating(overrides: Partial<MessageRating> = {}): MessageRating {
  return {
    id: "mr-1",
    messageId: "msg-1",
    rating: "down",
    comment: null,
    platform: "web",
    screen: "/assistant",
    createdAt: "2026-09-04T09:00:00.000Z",
    ...overrides,
  };
}

function authored(userId: string, overrides: Partial<Feedback> = {}): AuthoredFeedback {
  return { ...makeFeedback(overrides), userId };
}

function authoredRating(userId: string, overrides: Partial<MessageRating> = {}): AuthoredRating {
  return { ...makeMessageRating(overrides), userId };
}

function makeRepository(overrides: Partial<IFeedbackRepository> = {}): IFeedbackRepository {
  return {
    createGeneral: jest.fn().mockResolvedValue(makeFeedback()),
    rateMessage: jest.fn().mockResolvedValue(makeMessageRating()),
    isAdmin: jest.fn().mockResolvedValue(true),
    listFeedback: jest.fn().mockResolvedValue([]),
    listRatings: jest.fn().mockResolvedValue([]),
    listAuthors: jest.fn().mockResolvedValue([]),
    updateStatus: jest.fn().mockResolvedValue(makeFeedback({ status: "resolved" })),
    ...overrides,
  };
}

/** Moteur qui rend `chunks` de texte puis clôt, comme l'adaptateur réel. */
function makeLlm(chunks: string[] = ["## En bref\n", "Un testeur assidu."]): LlmProvider {
  const stream = jest.fn(() =>
    (async function* () {
      for (const chunk of chunks) yield { type: "text" as const, text: chunk };
      yield {
        type: "done" as const,
        response: {
          text: chunks.join(""),
          toolCalls: [],
          provider: "mistral",
          model: "ministral-14b",
          usage: { inputTokens: 12, outputTokens: 34 },
        },
      };
    })(),
  );

  return { name: "gateway", model: "mistral/ministral-14b", isSovereign: true, stream };
}

function makeService(repo: IFeedbackRepository = makeRepository(), llm = makeLlm()) {
  return new FeedbackService(repo, llm);
}

describe("FeedbackService", () => {
  describe("submitGeneral", () => {
    it("transmet l'avis au Repository avec l'utilisateur qui l'envoie", async () => {
      const repo = makeRepository();
      const input: CreateFeedback = {
        category: "idea",
        content: "Ce serait bien de pouvoir archiver plusieurs conversations d'un coup.",
        platform: "ios",
        screen: "/chat/abc",
      };

      const result = await makeService(repo).submitGeneral("user-1", input, TOKEN);

      expect(repo.createGeneral).toHaveBeenCalledWith("user-1", input, TOKEN);
      expect(result).toEqual(makeFeedback());
    });
  });

  describe("rateMessage", () => {
    it("transmet la notation au Repository, avec le message concerné", async () => {
      const repo = makeRepository();
      const input: RateMessage = { rating: "up", platform: "web", screen: "/assistant" };

      const result = await makeService(repo).rateMessage("user-1", "msg-1", input, TOKEN);

      expect(repo.rateMessage).toHaveBeenCalledWith("user-1", "msg-1", input, TOKEN);
      expect(result).toEqual(makeMessageRating());
    });

    it("transmet le commentaire optionnel d'un pouce bas", async () => {
      const repo = makeRepository();
      const input: RateMessage = {
        rating: "down",
        comment: "Il n'a pas compris ma question sur les rappels.",
        platform: "web",
        screen: "/assistant",
      };

      await makeService(repo).rateMessage("user-1", "msg-1", input, TOKEN);

      expect(repo.rateMessage).toHaveBeenCalledWith("user-1", "msg-1", input, TOKEN);
    });

    it("fait remonter l'erreur du Repository quand le message est introuvable", async () => {
      const repo = makeRepository({
        rateMessage: jest.fn().mockRejectedValue(Object.assign(new Error(), { status: 404 })),
      });
      const input: RateMessage = { rating: "up", platform: "web", screen: "/assistant" };

      await expect(
        makeService(repo).rateMessage("user-1", "inconnu", input, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("listByTester", () => {
    it("regroupe retours et notations par testeur, le plus récemment actif en tête", async () => {
      const repo = makeRepository({
        listFeedback: jest
          .fn()
          .mockResolvedValue([
            authored(LEA, { id: "fb-3", createdAt: "2026-09-20T10:00:00.000Z" }),
            authored(NICOLAS, { id: "fb-2", createdAt: "2026-09-12T10:00:00.000Z" }),
            authored(NICOLAS, { id: "fb-1", createdAt: "2026-09-11T10:00:00.000Z" }),
          ]),
        listRatings: jest
          .fn()
          .mockResolvedValue([
            authoredRating(NICOLAS, { id: "mr-1", createdAt: "2026-09-25T10:00:00.000Z" }),
          ]),
        listAuthors: jest.fn().mockResolvedValue([
          { id: NICOLAS, displayName: "Nicolas", email: "nicolas@example.fr" },
          { id: LEA, displayName: null, email: "lea@example.fr" },
        ]),
      });

      const testers = await makeService(repo).listByTester(TOKEN);

      expect(testers.map((tester) => tester.author.id)).toEqual([NICOLAS, LEA]);
      expect(testers[0]?.feedback.map((item) => item.id)).toEqual(["fb-2", "fb-1"]);
      expect(testers[0]?.ratings.map((item) => item.id)).toEqual(["mr-1"]);
      expect(testers[0]?.lastActivityAt).toBe("2026-09-25T10:00:00.000Z");
      expect(testers[1]?.author).toEqual({ id: LEA, displayName: null, email: "lea@example.fr" });
    });

    it("ne laisse pas l'identifiant de l'auteur dans chaque retour", async () => {
      const repo = makeRepository({
        listFeedback: jest.fn().mockResolvedValue([authored(NICOLAS)]),
      });

      const [tester] = await makeService(repo).listByTester(TOKEN);

      expect(tester?.feedback[0]).toEqual(makeFeedback());
    });

    it("garde les retours d'un auteur dont le compte a disparu, sans nom ni adresse", async () => {
      const repo = makeRepository({
        listFeedback: jest.fn().mockResolvedValue([authored(NICOLAS)]),
        listAuthors: jest.fn().mockResolvedValue([]),
      });

      const [tester] = await makeService(repo).listByTester(TOKEN);

      expect(tester?.author).toEqual({ id: NICOLAS, displayName: null, email: null });
      expect(tester?.feedback).toHaveLength(1);
    });

    it("rend une revue vide quand aucun testeur n'a rien envoyé", async () => {
      expect(await makeService().listByTester(TOKEN)).toEqual([]);
    });

    it("refuse la revue à qui n'est pas de l'équipe, sans rien lire", async () => {
      const repo = makeRepository({ isAdmin: jest.fn().mockResolvedValue(false) });

      await expect(makeService(repo).listByTester(TOKEN)).rejects.toMatchObject({ status: 403 });
      expect(repo.listFeedback).not.toHaveBeenCalled();
    });
  });

  describe("updateStatus", () => {
    it("change le statut d'un retour", async () => {
      const repo = makeRepository();

      const result = await makeService(repo).updateStatus("fb-1", "resolved", TOKEN);

      expect(repo.updateStatus).toHaveBeenCalledWith("fb-1", "resolved", TOKEN);
      expect(result.status).toBe("resolved");
    });

    it("signale un retour introuvable", async () => {
      const repo = makeRepository({ updateStatus: jest.fn().mockResolvedValue(null) });

      await expect(makeService(repo).updateStatus("fb-9", "resolved", TOKEN)).rejects.toMatchObject(
        { status: 404 },
      );
    });

    it("refuse le changement de statut à qui n'est pas de l'équipe", async () => {
      const repo = makeRepository({ isAdmin: jest.fn().mockResolvedValue(false) });

      await expect(makeService(repo).updateStatus("fb-1", "resolved", TOKEN)).rejects.toMatchObject(
        { status: 403 },
      );
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe("analyzeNew", () => {
    it("remet au modèle les seuls nouveaux retours, tous testeurs confondus", async () => {
      const llm = makeLlm();
      const repo = makeRepository({
        listFeedback: jest.fn().mockResolvedValue([
          authored(LEA, {
            id: "fb-3",
            content: "Le bouton d'envoi reste grisé après une erreur réseau.",
            platform: "ios",
          }),
          authored(NICOLAS, {
            id: "fb-2",
            category: "idea",
            content: "Pouvoir glisser une tâche d'un jour à l'autre.",
            screen: "/calendar",
          }),
          authored(NICOLAS, { id: "fb-1", status: "resolved", content: "Contraste trop fort." }),
          authored(LEA, { id: "fb-0", status: "acknowledged", content: "Réponses trop longues." }),
        ]),
      });

      const analysis = await makeService(repo, llm).analyzeNew(TOKEN);

      expect(analysis).toEqual({ summary: "## En bref\nUn testeur assidu." });

      const request = (llm.stream as jest.Mock).mock.calls[0][0];
      const content = request.messages[0].content as string;
      expect(content).toBe(
        "- [Testeur 1, Bug, 2026-09-04, ios, écran /assistant] " +
          "Le bouton d'envoi reste grisé après une erreur réseau.\n" +
          "- [Testeur 2, Idée, 2026-09-04, web, écran /calendar] " +
          "Pouvoir glisser une tâche d'un jour à l'autre.",
      );
    });

    it("ne remet au modèle ni nom, ni adresse, ni notation", async () => {
      const llm = makeLlm();
      const repo = makeRepository({
        listFeedback: jest.fn().mockResolvedValue([authored(NICOLAS)]),
        listRatings: jest
          .fn()
          .mockResolvedValue([authoredRating(NICOLAS, { comment: "Réponse trop longue." })]),
        listAuthors: jest
          .fn()
          .mockResolvedValue([
            { id: NICOLAS, displayName: "Nicolas", email: "nicolas@example.fr" },
          ]),
      });

      await makeService(repo, llm).analyzeNew(TOKEN);

      const request = (llm.stream as jest.Mock).mock.calls[0][0];
      const content = request.messages[0].content as string;
      expect(content).not.toContain("Nicolas");
      expect(content).not.toContain("nicolas@example.fr");
      expect(content).not.toContain("Réponse trop longue.");
    });

    it("n'appelle pas le modèle quand aucun retour n'est nouveau", async () => {
      const llm = makeLlm();
      const repo = makeRepository({
        listFeedback: jest.fn().mockResolvedValue([authored(NICOLAS, { status: "resolved" })]),
      });

      await expect(makeService(repo, llm).analyzeNew(TOKEN)).rejects.toMatchObject({
        status: 404,
      });
      expect(llm.stream).not.toHaveBeenCalled();
    });

    it("signale une synthèse vide plutôt que de la rendre", async () => {
      const repo = makeRepository({
        listFeedback: jest.fn().mockResolvedValue([authored(NICOLAS)]),
      });

      await expect(makeService(repo, makeLlm(["  "])).analyzeNew(TOKEN)).rejects.toMatchObject({
        status: 503,
      });
    });

    it("refuse l'analyse à qui n'est pas de l'équipe, sans rien lire ni appeler le modèle", async () => {
      const llm = makeLlm();
      const repo = makeRepository({ isAdmin: jest.fn().mockResolvedValue(false) });

      await expect(makeService(repo, llm).analyzeNew(TOKEN)).rejects.toMatchObject({
        status: 403,
      });
      expect(repo.listFeedback).not.toHaveBeenCalled();
      expect(llm.stream).not.toHaveBeenCalled();
    });
  });
});
