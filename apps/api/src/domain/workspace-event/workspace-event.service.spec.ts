import type { WorkspaceEvent } from "@jc/domain";
import type { IWorkspaceEventRepository } from "./workspace-event.repository.interface.js";
import { WorkspaceEventService } from "./workspace-event.service.js";

const TOKEN = "access-token";
const SPACE = {
  workspaceId: "ws-1",
  workspaceName: "Club de jardinage",
  groupId: "group-1",
  groupTitle: "Bureau",
};

function makeEvent(overrides: Partial<WorkspaceEvent> = {}): WorkspaceEvent {
  return {
    id: "wev-1",
    groupId: "group-1",
    title: "Réunion",
    notes: null,
    startsAt: "2026-10-01T16:00:00.000Z",
    endsAt: "2026-10-01T17:00:00.000Z",
    allDay: false,
    reminderMinutesBefore: null,
    createdBy: "alice",
    createdByAssistant: false,
    createdAt: "2026-09-30T08:00:00.000Z",
    updatedAt: "2026-09-30T08:00:00.000Z",
    ...overrides,
  };
}

function makeRepository(
  overrides: Partial<IWorkspaceEventRepository> = {},
): IWorkspaceEventRepository {
  return {
    findSpace: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
    findInRange: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation(async (_userId, input) => makeEvent(input)),
    update: jest.fn().mockImplementation(async (id, patch) => makeEvent({ id, ...patch })),
    delete: jest.fn().mockResolvedValue(undefined),
    findAuthor: jest.fn().mockResolvedValue({ displayName: "Clarisse", timezone: "Europe/Paris" }),
    appendSystemMessage: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const input = {
  groupId: "group-1",
  title: "Réunion",
  startsAt: "2026-10-01T16:00:00.000Z",
  endsAt: "2026-10-01T17:00:00.000Z",
  allDay: false,
};

describe("WorkspaceEventService", () => {
  describe("create", () => {
    it("ajoute l'événement et le dit dans le fil, dans le fuseau de l'auteur", async () => {
      const repo = makeRepository({ findSpace: jest.fn().mockResolvedValue(SPACE) });

      await new WorkspaceEventService(repo).create("alice", input, TOKEN);

      expect(repo.create).toHaveBeenCalledWith("alice", input, false, TOKEN);
      expect(repo.appendSystemMessage).toHaveBeenCalledWith(
        "group-1",
        "alice",
        "Clarisse a ajouté « Réunion » au calendrier : jeudi 1er octobre, 18 h – 19 h.",
        TOKEN,
      );
    });

    it("marque l'événement venu d'une proposition de Jean-Claude", async () => {
      const repo = makeRepository({ findSpace: jest.fn().mockResolvedValue(SPACE) });

      await new WorkspaceEventService(repo).create("alice", input, TOKEN, true);

      expect(repo.create).toHaveBeenCalledWith("alice", input, true, TOKEN);
    });

    it("signe « Un membre » un auteur sans nom", async () => {
      const repo = makeRepository({
        findSpace: jest.fn().mockResolvedValue(SPACE),
        findAuthor: jest.fn().mockResolvedValue({ displayName: null, timezone: "Europe/Paris" }),
      });

      await new WorkspaceEventService(repo).create("alice", input, TOKEN);

      expect(repo.appendSystemMessage).toHaveBeenCalledWith(
        "group-1",
        "alice",
        expect.stringMatching(/^Un membre a ajouté/),
        TOKEN,
      );
    });

    it("refuse une conversation dont on n'est pas membre", async () => {
      const repo = makeRepository();

      await expect(
        new WorkspaceEventService(repo).create("dora", input, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("refuse une fin qui précède le début", async () => {
      const repo = makeRepository({ findSpace: jest.fn().mockResolvedValue(SPACE) });

      await expect(
        new WorkspaceEventService(repo).create(
          "alice",
          { ...input, endsAt: "2026-10-01T15:00:00.000Z" },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("laisse tout membre déplacer l'événement, et le dit dans le fil", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeEvent()) });

      await new WorkspaceEventService(repo).update(
        "wev-1",
        "bruno",
        { startsAt: "2026-10-02T16:00:00.000Z", endsAt: null },
        TOKEN,
      );

      expect(repo.appendSystemMessage).toHaveBeenCalledWith(
        "group-1",
        "bruno",
        "Clarisse a déplacé « Réunion » au vendredi 2 octobre, 18 h.",
        TOKEN,
      );
    });

    it("juge l'horaire sur l'événement tel qu'il sera, pas sur le seul patch", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeEvent()) });

      await expect(
        new WorkspaceEventService(repo).update(
          "wev-1",
          "bruno",
          { endsAt: "2026-10-01T15:00:00.000Z" },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it("rend un 404 pour un événement introuvable ou hors de ses conversations", async () => {
      await expect(
        new WorkspaceEventService(makeRepository()).update("wev-x", "bruno", {}, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("delete", () => {
    it("retire l'événement et le dit dans le fil", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeEvent()) });

      await new WorkspaceEventService(repo).delete("wev-1", "bruno", TOKEN);

      expect(repo.delete).toHaveBeenCalledWith("wev-1", TOKEN);
      expect(repo.appendSystemMessage).toHaveBeenCalledWith(
        "group-1",
        "bruno",
        "Clarisse a retiré « Réunion » du calendrier.",
        TOKEN,
      );
    });

    it("rend un 404 pour un événement introuvable", async () => {
      const repo = makeRepository();

      await expect(
        new WorkspaceEventService(repo).delete("wev-x", "bruno", TOKEN),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
