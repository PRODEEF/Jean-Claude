import type {
  ReceivedInvitation,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
} from "@jc/domain";
import type { IWorkspaceRepository } from "./workspace.repository.interface.js";
import { WorkspaceService } from "./workspace.service.js";

const TOKEN = "access-token";
const WORKSPACE_ID = "ws-1";

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: WORKSPACE_ID,
    name: "Association X",
    role: "admin",
    memberCount: 2,
    createdAt: "2026-09-29T08:00:00.000Z",
    ...overrides,
  };
}

function makeMember(
  overrides: Partial<WorkspaceMember> & Pick<WorkspaceMember, "userId">,
): WorkspaceMember {
  return { displayName: null, email: null, role: "member", ...overrides };
}

const ALICE = makeMember({ userId: "alice", email: "alice@x.fr", role: "admin" });
const BRUNO = makeMember({ userId: "bruno", email: "bruno@x.fr" });

function makeInvitation(overrides: Partial<ReceivedInvitation> = {}): ReceivedInvitation {
  return {
    id: "inv-1",
    workspaceId: WORKSPACE_ID,
    workspaceName: "Association X",
    createdAt: "2026-09-29T08:00:00.000Z",
    status: "pending",
    answeredAt: null,
    ...overrides,
  };
}

function makeRepository(overrides: Partial<IWorkspaceRepository> = {}): IWorkspaceRepository {
  return {
    findMine: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    rename: jest.fn().mockResolvedValue(undefined),
    findMembers: jest.fn().mockResolvedValue([]),
    updateMemberRole: jest.fn().mockResolvedValue(undefined),
    removeMember: jest.fn().mockResolvedValue(undefined),
    findPendingInvitations: jest.fn().mockResolvedValue([]),
    createInvitation: jest.fn().mockResolvedValue(null),
    deleteInvitation: jest.fn().mockResolvedValue(false),
    findReceivedInvitations: jest.fn().mockResolvedValue([]),
    findReceivedInvitation: jest.fn().mockResolvedValue(null),
    join: jest.fn().mockResolvedValue(undefined),
    answerInvitation: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Dépôt vu par un admin de l'espace, avec ses membres. */
function asAdmin(members: WorkspaceMember[], overrides: Partial<IWorkspaceRepository> = {}) {
  return makeRepository({
    findById: jest.fn().mockResolvedValue(makeWorkspace({ role: "admin" })),
    findMembers: jest.fn().mockResolvedValue(members),
    ...overrides,
  });
}

/** Dépôt vu par un simple membre de l'espace. */
function asMember(members: WorkspaceMember[], overrides: Partial<IWorkspaceRepository> = {}) {
  return makeRepository({
    findById: jest.fn().mockResolvedValue(makeWorkspace({ role: "member" })),
    findMembers: jest.fn().mockResolvedValue(members),
    ...overrides,
  });
}

describe("WorkspaceService", () => {
  describe("rename", () => {
    it("renomme l'espace quand l'appelant en est admin", async () => {
      const repo = asAdmin([ALICE]);

      const result = await new WorkspaceService(repo).rename(
        WORKSPACE_ID,
        "alice",
        { name: "Asso Y" },
        TOKEN,
      );

      expect(result.name).toBe("Asso Y");
      expect(repo.rename).toHaveBeenCalledWith(WORKSPACE_ID, "Asso Y", TOKEN);
    });

    it("refuse à un simple membre de renommer l'espace", async () => {
      const repo = asMember([ALICE, BRUNO]);

      await expect(
        new WorkspaceService(repo).rename(WORKSPACE_ID, "bruno", { name: "Asso Y" }, TOKEN),
      ).rejects.toMatchObject({ status: 403 });
      expect(repo.rename).not.toHaveBeenCalled();
    });

    it("répond introuvable à qui n'est pas membre, sans révéler que l'espace existe", async () => {
      const repo = makeRepository();

      await expect(
        new WorkspaceService(repo).rename(WORKSPACE_ID, "chloe", { name: "Asso Y" }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("listMembers", () => {
    it("liste les membres pour un membre de l'espace", async () => {
      const repo = asMember([ALICE, BRUNO]);

      const members = await new WorkspaceService(repo).listMembers(WORKSPACE_ID, "bruno", TOKEN);

      expect(members).toEqual([ALICE, BRUNO]);
    });

    it("refuse la liste à qui n'est pas membre", async () => {
      const repo = makeRepository();

      await expect(
        new WorkspaceService(repo).listMembers(WORKSPACE_ID, "chloe", TOKEN),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.findMembers).not.toHaveBeenCalled();
    });
  });

  describe("changeRole", () => {
    it("nomme un membre admin", async () => {
      const repo = asAdmin([ALICE, BRUNO]);

      const result = await new WorkspaceService(repo).changeRole(
        WORKSPACE_ID,
        "alice",
        "bruno",
        "admin",
        TOKEN,
      );

      expect(result.role).toBe("admin");
      expect(repo.updateMemberRole).toHaveBeenCalledWith(WORKSPACE_ID, "bruno", "admin", TOKEN);
    });

    it("refuse de retirer son rôle au dernier admin", async () => {
      const repo = asAdmin([ALICE, BRUNO]);

      await expect(
        new WorkspaceService(repo).changeRole(WORKSPACE_ID, "alice", "alice", "member", TOKEN),
      ).rejects.toMatchObject({ status: 409 });
      expect(repo.updateMemberRole).not.toHaveBeenCalled();
    });

    it("laisse un admin redevenir membre quand un autre admin reste", async () => {
      const repo = asAdmin([ALICE, { ...BRUNO, role: "admin" }]);

      await new WorkspaceService(repo).changeRole(WORKSPACE_ID, "alice", "alice", "member", TOKEN);

      expect(repo.updateMemberRole).toHaveBeenCalledWith(WORKSPACE_ID, "alice", "member", TOKEN);
    });

    it("n'écrit rien quand le rôle est déjà le bon", async () => {
      const repo = asAdmin([ALICE, BRUNO]);

      await new WorkspaceService(repo).changeRole(WORKSPACE_ID, "alice", "bruno", "member", TOKEN);

      expect(repo.updateMemberRole).not.toHaveBeenCalled();
    });

    it("refuse à un simple membre de changer un rôle", async () => {
      const repo = asMember([ALICE, BRUNO]);

      await expect(
        new WorkspaceService(repo).changeRole(WORKSPACE_ID, "bruno", "bruno", "admin", TOKEN),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("répond introuvable pour une personne hors de l'espace", async () => {
      const repo = asAdmin([ALICE]);

      await expect(
        new WorkspaceService(repo).changeRole(WORKSPACE_ID, "alice", "chloe", "admin", TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("removeMember", () => {
    it("laisse un admin retirer un membre", async () => {
      const repo = asAdmin([ALICE, BRUNO]);

      await new WorkspaceService(repo).removeMember(WORKSPACE_ID, "alice", "bruno", TOKEN);

      expect(repo.removeMember).toHaveBeenCalledWith(WORKSPACE_ID, "bruno", TOKEN);
    });

    it("laisse un membre quitter l'espace de lui-même", async () => {
      const repo = asMember([ALICE, BRUNO]);

      await new WorkspaceService(repo).removeMember(WORKSPACE_ID, "bruno", "bruno", TOKEN);

      expect(repo.removeMember).toHaveBeenCalledWith(WORKSPACE_ID, "bruno", TOKEN);
    });

    it("refuse à un simple membre d'en retirer un autre", async () => {
      const repo = asMember([ALICE, BRUNO]);

      await expect(
        new WorkspaceService(repo).removeMember(WORKSPACE_ID, "bruno", "alice", TOKEN),
      ).rejects.toMatchObject({ status: 403 });
      expect(repo.removeMember).not.toHaveBeenCalled();
    });

    it("empêche le dernier admin de quitter l'espace sans avoir nommé de successeur", async () => {
      const repo = asAdmin([ALICE, BRUNO]);

      await expect(
        new WorkspaceService(repo).removeMember(WORKSPACE_ID, "alice", "alice", TOKEN),
      ).rejects.toMatchObject({
        status: 409,
        message: "Nommez un autre admin avant de quitter l'espace.",
      });
      expect(repo.removeMember).not.toHaveBeenCalled();
    });

    it("laisse partir un admin quand un autre admin reste", async () => {
      const repo = asAdmin([ALICE, { ...BRUNO, role: "admin" }]);

      await new WorkspaceService(repo).removeMember(WORKSPACE_ID, "alice", "alice", TOKEN);

      expect(repo.removeMember).toHaveBeenCalledWith(WORKSPACE_ID, "alice", TOKEN);
    });

    it("répond introuvable pour une personne hors de l'espace", async () => {
      const repo = asAdmin([ALICE]);

      await expect(
        new WorkspaceService(repo).removeMember(WORKSPACE_ID, "alice", "chloe", TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("invite", () => {
    const invitation: WorkspaceInvitation = {
      id: "inv-1",
      workspaceId: WORKSPACE_ID,
      email: "chloe@x.fr",
      createdAt: "2026-09-29T08:00:00.000Z",
    };

    it("enregistre une invitation pour une nouvelle adresse", async () => {
      const repo = asAdmin([ALICE, BRUNO], {
        createInvitation: jest.fn().mockResolvedValue(invitation),
      });

      const result = await new WorkspaceService(repo).invite(
        WORKSPACE_ID,
        "alice",
        { email: "chloe@x.fr" },
        TOKEN,
      );

      expect(result).toEqual(invitation);
      expect(repo.createInvitation).toHaveBeenCalledWith(
        WORKSPACE_ID,
        "alice",
        "chloe@x.fr",
        TOKEN,
      );
    });

    it("refuse d'inviter une adresse déjà membre, quelle que soit la casse enregistrée", async () => {
      const repo = asAdmin([ALICE, { ...BRUNO, email: "Bruno@X.fr" }]);

      await expect(
        new WorkspaceService(repo).invite(WORKSPACE_ID, "alice", { email: "bruno@x.fr" }, TOKEN),
      ).rejects.toMatchObject({ status: 409 });
      expect(repo.createInvitation).not.toHaveBeenCalled();
    });

    it("refuse une seconde invitation en attente pour la même adresse", async () => {
      const repo = asAdmin([ALICE], { createInvitation: jest.fn().mockResolvedValue(null) });

      await expect(
        new WorkspaceService(repo).invite(WORKSPACE_ID, "alice", { email: "chloe@x.fr" }, TOKEN),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("refuse à un simple membre d'inviter", async () => {
      const repo = asMember([ALICE, BRUNO]);

      await expect(
        new WorkspaceService(repo).invite(WORKSPACE_ID, "bruno", { email: "chloe@x.fr" }, TOKEN),
      ).rejects.toMatchObject({ status: 403 });
      expect(repo.createInvitation).not.toHaveBeenCalled();
    });
  });

  describe("revokeInvitation", () => {
    it("annule une invitation en attente", async () => {
      const repo = asAdmin([ALICE], { deleteInvitation: jest.fn().mockResolvedValue(true) });

      await new WorkspaceService(repo).revokeInvitation(WORKSPACE_ID, "alice", "inv-1", TOKEN);

      expect(repo.deleteInvitation).toHaveBeenCalledWith("inv-1", WORKSPACE_ID, TOKEN);
    });

    it("répond introuvable pour une invitation déjà traitée ou inconnue", async () => {
      const repo = asAdmin([ALICE]);

      await expect(
        new WorkspaceService(repo).revokeInvitation(WORKSPACE_ID, "alice", "inv-1", TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("listReceivedInvitations", () => {
    it("cherche les invitations sous l'adresse normalisée", async () => {
      const repo = makeRepository({
        findReceivedInvitations: jest.fn().mockResolvedValue([makeInvitation()]),
      });

      const result = await new WorkspaceService(repo).listReceivedInvitations(
        " Chloe@X.fr ",
        TOKEN,
      );

      expect(result).toHaveLength(1);
      expect(repo.findReceivedInvitations).toHaveBeenCalledWith("chloe@x.fr", TOKEN);
    });

    it("rend une liste vide quand rien n'attend", async () => {
      const repo = makeRepository();

      await expect(
        new WorkspaceService(repo).listReceivedInvitations("chloe@x.fr", TOKEN),
      ).resolves.toEqual([]);
    });
  });

  describe("acceptInvitation", () => {
    it("inscrit la personne puis marque l'invitation acceptée, dans cet ordre", async () => {
      const calls: string[] = [];
      const repo = makeRepository({
        findReceivedInvitation: jest.fn().mockResolvedValue(makeInvitation()),
        join: jest.fn().mockImplementation(async () => void calls.push("join")),
        answerInvitation: jest.fn().mockImplementation(async () => void calls.push("answer")),
        findById: jest.fn().mockResolvedValue(makeWorkspace({ role: "member" })),
      });

      const result = await new WorkspaceService(repo).acceptInvitation(
        "inv-1",
        "chloe",
        "Chloe@x.fr",
        TOKEN,
      );

      expect(result.role).toBe("member");
      expect(calls).toEqual(["join", "answer"]);
      expect(repo.findReceivedInvitation).toHaveBeenCalledWith("inv-1", "chloe@x.fr", TOKEN);
      expect(repo.answerInvitation).toHaveBeenCalledWith("inv-1", "accepted", TOKEN);
    });

    it("répond introuvable pour une invitation qui ne vise pas l'appelant", async () => {
      const repo = makeRepository();

      await expect(
        new WorkspaceService(repo).acceptInvitation("inv-1", "chloe", "chloe@x.fr", TOKEN),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.join).not.toHaveBeenCalled();
    });
  });

  describe("declineInvitation", () => {
    it("marque l'invitation refusée sans inscrire la personne", async () => {
      const repo = makeRepository({
        findReceivedInvitation: jest.fn().mockResolvedValue(makeInvitation()),
      });

      await new WorkspaceService(repo).declineInvitation("inv-1", "chloe@x.fr", TOKEN);

      expect(repo.answerInvitation).toHaveBeenCalledWith("inv-1", "declined", TOKEN);
      expect(repo.join).not.toHaveBeenCalled();
    });

    it("répond introuvable pour une invitation inconnue", async () => {
      const repo = makeRepository();

      await expect(
        new WorkspaceService(repo).declineInvitation("inv-1", "chloe@x.fr", TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
