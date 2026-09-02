import type { Conversation, SearchFilters } from "@jc/domain";
import type {
  IUserRepository,
  ProfileRecord,
} from "../../domain/user/user.repository.interface.js";
import { SearchService } from "./search.service.js";
import type { ISearchRepository } from "./search.repository.interface.js";

const USER = "11111111-1111-4111-8111-111111111111";
const TOKEN = "access-token";

function makeConversation(id: string, title = "Conversation"): Conversation {
  return {
    id,
    kind: "chat",
    title,
    folderIds: [],
    archivedAt: null,
    lastMessageAt: "2026-09-01T10:00:00.000Z",
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  };
}

function makeSearchRepository(overrides: Partial<ISearchRepository> = {}): ISearchRepository {
  return {
    findIdsInFolders: jest.fn().mockResolvedValue([]),
    findIdsByTitle: jest.fn().mockResolvedValue([]),
    findMessageMatches: jest.fn().mockResolvedValue([]),
    findConversations: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    ...overrides,
  };
}

function makeUserRepository(timezone = "Europe/Paris"): IUserRepository {
  const profile = {
    preferences: { timezone },
  } as unknown as ProfileRecord;

  return {
    findById: jest.fn().mockResolvedValue(profile),
    update: jest.fn(),
    completeOnboarding: jest.fn(),
  };
}

function filters(overrides: Partial<SearchFilters> = {}): SearchFilters {
  return { includeArchived: false, limit: 30, ...overrides };
}

describe("SearchService", () => {
  it("rend la page telle quelle quand aucun filtre n'est posé", async () => {
    const repo = makeSearchRepository({
      findConversations: jest
        .fn()
        .mockResolvedValue({ items: [makeConversation("c1")], nextCursor: null }),
    });

    const page = await new SearchService(repo, makeUserRepository()).search(USER, TOKEN, filters());

    expect(page.items).toEqual([{ conversation: makeConversation("c1"), excerpt: null }]);
    expect(repo.findConversations).toHaveBeenCalledWith(
      expect.objectContaining({ includeArchived: false, limit: 30 }),
      TOKEN,
    );
    // Sans restriction : une liste vide voudrait dire « aucune conversation ne convient ».
    expect((repo.findConversations as jest.Mock).mock.calls[0][0]).not.toHaveProperty("ids");
  });

  it("réunit les fils trouvés par leur titre et ceux trouvés par leurs messages", async () => {
    const repo = makeSearchRepository({
      findIdsByTitle: jest.fn().mockResolvedValue(["titre"]),
      findMessageMatches: jest
        .fn()
        .mockResolvedValue([{ conversationId: "message", content: "Le rendez-vous mutuelle" }]),
      findConversations: jest.fn().mockResolvedValue({
        items: [makeConversation("titre"), makeConversation("message")],
        nextCursor: null,
      }),
    });

    const page = await new SearchService(repo, makeUserRepository()).search(
      USER,
      TOKEN,
      filters({ query: "mutuelle" }),
    );

    expect((repo.findConversations as jest.Mock).mock.calls[0][0].ids.sort()).toEqual([
      "message",
      "titre",
    ]);
    // L'extrait ne concerne que le fil retenu sur le contenu d'un message.
    expect(page.items[0]?.excerpt).toBeNull();
    expect(page.items[1]?.excerpt).toBe("Le rendez-vous mutuelle");
  });

  it("croise le mot-clé et les dossiers au lieu de les cumuler", async () => {
    const repo = makeSearchRepository({
      findIdsInFolders: jest.fn().mockResolvedValue(["dans-le-dossier", "aussi"]),
      findIdsByTitle: jest.fn().mockResolvedValue(["dans-le-dossier", "ailleurs"]),
    });

    await new SearchService(repo, makeUserRepository()).search(
      USER,
      TOKEN,
      filters({ query: "impôts", folderIds: ["f1"] }),
    );

    expect((repo.findConversations as jest.Mock).mock.calls[0][0].ids).toEqual(["dans-le-dossier"]);
  });

  it("rend une page vide sans interroger la base quand le croisement ne laisse rien", async () => {
    const repo = makeSearchRepository({
      findIdsInFolders: jest.fn().mockResolvedValue(["a"]),
      findIdsByTitle: jest.fn().mockResolvedValue(["b"]),
    });

    const page = await new SearchService(repo, makeUserRepository()).search(
      USER,
      TOKEN,
      filters({ query: "impôts", folderIds: ["f1"] }),
    );

    expect(page).toEqual({ items: [], nextCursor: null });
    expect(repo.findConversations).not.toHaveBeenCalled();
  });

  it("traduit le raccourci de date dans le fuseau du profil", async () => {
    const repo = makeSearchRepository();
    const users = makeUserRepository("Asia/Tokyo");

    await new SearchService(repo, users).search(USER, TOKEN, filters({ shortcut: "this_year" }));

    expect(users.findById).toHaveBeenCalledWith(USER, TOKEN);
    // 1er janvier à minuit à Tokyo, soit 15 h UTC la veille.
    expect((repo.findConversations as jest.Mock).mock.calls[0][0].from).toBe(
      "2025-12-31T15:00:00.000Z",
    );
  });

  it("ne lit pas le profil en l'absence de filtre de date", async () => {
    const users = makeUserRepository();

    await new SearchService(makeSearchRepository(), users).search(USER, TOKEN, filters());

    expect(users.findById).not.toHaveBeenCalled();
  });

  it("centre l'extrait sur le passage trouvé et le borne", async () => {
    const content = `${"a ".repeat(200)}mutuelle ${"b ".repeat(200)}`;
    const repo = makeSearchRepository({
      findIdsByTitle: jest.fn().mockResolvedValue([]),
      findMessageMatches: jest.fn().mockResolvedValue([{ conversationId: "c1", content }]),
      findConversations: jest
        .fn()
        .mockResolvedValue({ items: [makeConversation("c1")], nextCursor: null }),
    });

    const page = await new SearchService(repo, makeUserRepository()).search(
      USER,
      TOKEN,
      filters({ query: "mutuelle" }),
    );

    const excerpt = page.items[0]?.excerpt ?? "";
    expect(excerpt).toContain("mutuelle");
    expect(excerpt.startsWith("…")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(162);
  });

  it("garde le premier message trouvé, le plus récent, pour l'extrait", async () => {
    const repo = makeSearchRepository({
      findMessageMatches: jest.fn().mockResolvedValue([
        { conversationId: "c1", content: "Le plus récent" },
        { conversationId: "c1", content: "Le plus ancien" },
      ]),
      findConversations: jest
        .fn()
        .mockResolvedValue({ items: [makeConversation("c1")], nextCursor: null }),
    });

    const page = await new SearchService(repo, makeUserRepository()).search(
      USER,
      TOKEN,
      filters({ query: "récent" }),
    );

    expect(page.items[0]?.excerpt).toBe("Le plus récent");
  });
});
