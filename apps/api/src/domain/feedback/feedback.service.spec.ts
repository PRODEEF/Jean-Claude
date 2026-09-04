import type { CreateFeedback, Feedback, MessageRating, RateMessage } from "@jc/domain";
import { FeedbackService } from "./feedback.service.js";
import type { IFeedbackRepository } from "./feedback.repository.interface.js";

const TOKEN = "access-token";

function makeFeedback(overrides: Partial<Feedback> = {}): Feedback {
  return {
    id: "fb-1",
    category: "bug",
    content: "Le bouton d'envoi reste grisé après une erreur réseau.",
    platform: "web",
    screen: "/assistant",
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

function makeRepository(overrides: Partial<IFeedbackRepository> = {}): IFeedbackRepository {
  return {
    createGeneral: jest.fn().mockResolvedValue(makeFeedback()),
    rateMessage: jest.fn().mockResolvedValue(makeMessageRating()),
    ...overrides,
  };
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

      const result = await new FeedbackService(repo).submitGeneral("user-1", input, TOKEN);

      expect(repo.createGeneral).toHaveBeenCalledWith("user-1", input, TOKEN);
      expect(result).toEqual(makeFeedback());
    });
  });

  describe("rateMessage", () => {
    it("transmet la notation au Repository, avec le message concerné", async () => {
      const repo = makeRepository();
      const input: RateMessage = { rating: "up", platform: "web", screen: "/assistant" };

      const result = await new FeedbackService(repo).rateMessage("user-1", "msg-1", input, TOKEN);

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

      await new FeedbackService(repo).rateMessage("user-1", "msg-1", input, TOKEN);

      expect(repo.rateMessage).toHaveBeenCalledWith("user-1", "msg-1", input, TOKEN);
    });

    it("fait remonter l'erreur du Repository quand le message est introuvable", async () => {
      const repo = makeRepository({
        rateMessage: jest.fn().mockRejectedValue(Object.assign(new Error(), { status: 404 })),
      });
      const input: RateMessage = { rating: "up", platform: "web", screen: "/assistant" };

      await expect(
        new FeedbackService(repo).rateMessage("user-1", "inconnu", input, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
