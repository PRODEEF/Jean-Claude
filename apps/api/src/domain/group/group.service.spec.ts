import type { Group, GroupMessage } from "@jc/domain";
import type { IGroupRepository } from "./group.repository.interface.js";
import { GroupService } from "./group.service.js";

const TOKEN = "access-token";
const WORKSPACE_ID = "ws-1";

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: "group-1",
    workspaceId: WORKSPACE_ID,
    title: "Bureau",
    memberIds: ["alice", "bruno"],
    aiMuted: false,
    unreadCount: 0,
    lastMessageAt: null,
    createdAt: "2026-09-29T08:00:00.000Z",
    ...overrides,
  };
}

function makeMessage(overrides: Partial<GroupMessage> = {}): GroupMessage {
  return {
    id: "msg-1",
    groupId: "group-1",
    authorId: "alice",
    role: "user",
    content: "Bonjour",
    createdAt: "2026-09-29T08:00:00.000Z",
    ...overrides,
  };
}

function makeRepository(overrides: Partial<IGroupRepository> = {}): IGroupRepository {
  return {
    findWorkspaceMemberIds: jest.fn().mockResolvedValue([]),
    findByWorkspace: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(async (_userId, input) => makeGroup(input)),
    findMessages: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    appendMessage: jest.fn().mockResolvedValue(makeMessage()),
    markRead: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Espace dont Alice, Bruno et Chloé sont membres. */
function inWorkspace(overrides: Partial<IGroupRepository> = {}): IGroupRepository {
  return makeRepository({
    findWorkspaceMemberIds: jest.fn().mockResolvedValue(["alice", "bruno", "chloe"]),
    ...overrides,
  });
}

describe("GroupService", () => {
  describe("list", () => {
    it("liste les groupes de l'espace pour un membre", async () => {
      const repo = inWorkspace({ findByWorkspace: jest.fn().mockResolvedValue([makeGroup()]) });

      const groups = await new GroupService(repo).list(WORKSPACE_ID, "alice", TOKEN);

      expect(groups).toHaveLength(1);
      expect(repo.findByWorkspace).toHaveBeenCalledWith(WORKSPACE_ID, "alice", TOKEN);
    });

    it("répond introuvable à qui n'est pas membre de l'espace", async () => {
      const repo = inWorkspace();

      await expect(new GroupService(repo).list(WORKSPACE_ID, "dora", TOKEN)).rejects.toMatchObject({
        status: 404,
      });
      expect(repo.findByWorkspace).not.toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("crée le groupe avec les personnes choisies, le créateur en plus", async () => {
      const repo = inWorkspace();

      await new GroupService(repo).create(
        "alice",
        { workspaceId: WORKSPACE_ID, title: "Bureau", memberIds: ["bruno", "chloe"] },
        TOKEN,
      );

      expect(repo.create).toHaveBeenCalledWith(
        "alice",
        { workspaceId: WORKSPACE_ID, title: "Bureau", memberIds: ["bruno", "chloe"] },
        TOKEN,
      );
    });

    it("ne compte ni le créateur coché ni une personne cochée deux fois", async () => {
      const repo = inWorkspace();

      await new GroupService(repo).create(
        "alice",
        { workspaceId: WORKSPACE_ID, title: "Bureau", memberIds: ["alice", "bruno", "bruno"] },
        TOKEN,
      );

      expect(repo.create).toHaveBeenCalledWith(
        "alice",
        expect.objectContaining({ memberIds: ["bruno"] }),
        TOKEN,
      );
    });

    it("refuse un groupe où le créateur serait seul", async () => {
      const repo = inWorkspace();

      await expect(
        new GroupService(repo).create(
          "alice",
          { workspaceId: WORKSPACE_ID, title: "Seule", memberIds: ["alice"] },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("refuse une personne qui ne fait pas partie de l'espace", async () => {
      const repo = inWorkspace();

      await expect(
        new GroupService(repo).create(
          "alice",
          { workspaceId: WORKSPACE_ID, title: "Bureau", memberIds: ["bruno", "dora"] },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("refuse de créer un groupe dans un espace dont on n'est pas membre", async () => {
      const repo = inWorkspace();

      await expect(
        new GroupService(repo).create(
          "dora",
          { workspaceId: WORKSPACE_ID, title: "Intrus", memberIds: ["bruno"] },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("send", () => {
    it("ajoute le message au fil d'un groupe dont on est membre", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeGroup()) });

      const message = await new GroupService(repo).send(
        "group-1",
        "alice",
        { content: "Bonjour" },
        TOKEN,
      );

      expect(message.content).toBe("Bonjour");
      expect(repo.appendMessage).toHaveBeenCalledWith("group-1", "alice", "Bonjour", TOKEN);
    });

    it("refuse d'écrire dans un groupe dont on n'est pas membre", async () => {
      const repo = makeRepository();

      await expect(
        new GroupService(repo).send("group-1", "dora", { content: "Intrusion" }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.appendMessage).not.toHaveBeenCalled();
    });
  });

  describe("listMessages", () => {
    it("transmet le curseur et la taille de page", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeGroup()) });

      await new GroupService(repo).listMessages(
        "group-1",
        "alice",
        { cursor: "2026-09-29T08:00:00.000Z", limit: 30 },
        TOKEN,
      );

      expect(repo.findMessages).toHaveBeenCalledWith(
        "group-1",
        { cursor: "2026-09-29T08:00:00.000Z", limit: 30 },
        TOKEN,
      );
    });

    it("refuse le fil à qui n'est pas membre du groupe", async () => {
      const repo = makeRepository();

      await expect(
        new GroupService(repo).listMessages("group-1", "dora", { limit: 30 }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("markRead", () => {
    it("remet les non-lus à zéro", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeGroup({ unreadCount: 3 })),
      });

      const group = await new GroupService(repo).markRead("group-1", "alice", TOKEN);

      expect(group.unreadCount).toBe(0);
      expect(repo.markRead).toHaveBeenCalledWith("group-1", "alice", TOKEN);
    });

    it("n'écrit rien quand tout est déjà lu", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeGroup()) });

      await new GroupService(repo).markRead("group-1", "alice", TOKEN);

      expect(repo.markRead).not.toHaveBeenCalled();
    });
  });
});
