import type { WorkspaceTask, WorkspaceTaskList } from "@jc/domain";
import type { IWorkspaceListRepository } from "./workspace-list.repository.interface.js";
import { WorkspaceListService } from "./workspace-list.service.js";

const TOKEN = "access-token";
const WORKSPACE_ID = "ws-1";

function makeTask(overrides: Partial<WorkspaceTask> = {}): WorkspaceTask {
  return {
    id: "t1",
    listId: "list-1",
    title: "Acheter les gobelets",
    done: false,
    assigneeId: null,
    position: 0,
    createdAt: "2026-09-29T08:00:00.000Z",
    ...overrides,
  };
}

function makeList(overrides: Partial<WorkspaceTaskList> = {}): WorkspaceTaskList {
  return {
    id: "list-1",
    workspaceId: WORKSPACE_ID,
    title: "Courses kermesse",
    folderId: null,
    conversationId: null,
    tasks: [],
    createdAt: "2026-09-29T08:00:00.000Z",
    updatedAt: "2026-09-29T08:00:00.000Z",
    ...overrides,
  };
}

function makeRepository(
  overrides: Partial<IWorkspaceListRepository> = {},
): IWorkspaceListRepository {
  return {
    findWorkspaceMemberIds: jest.fn().mockResolvedValue(["alice", "bruno"]),
    findWorkspaceFolderIds: jest.fn().mockResolvedValue(["f1"]),
    findByWorkspace: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(async () => makeList()),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    addTask: jest.fn().mockImplementation(async (_userId, _listId, task) => makeTask(task)),
    updateTask: jest.fn().mockImplementation(async (id, patch) => makeTask({ id, ...patch })),
    deleteTask: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Dépôt où la liste existe et se lit. */
function withList(list: WorkspaceTaskList, overrides: Partial<IWorkspaceListRepository> = {}) {
  return makeRepository({ findById: jest.fn().mockResolvedValue(list), ...overrides });
}

describe("WorkspaceListService", () => {
  describe("list", () => {
    it("liste les listes de l'espace pour un membre", async () => {
      const repo = makeRepository({ findByWorkspace: jest.fn().mockResolvedValue([makeList()]) });

      const lists = await new WorkspaceListService(repo).list(WORKSPACE_ID, "alice", TOKEN);

      expect(lists).toHaveLength(1);
    });

    it("répond introuvable à qui n'est pas membre de l'espace", async () => {
      await expect(
        new WorkspaceListService(makeRepository()).list(WORKSPACE_ID, "dora", TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("create", () => {
    it("crée la liste avec ses tâches dans l'ordre donné", async () => {
      const repo = makeRepository();

      await new WorkspaceListService(repo).create(
        "alice",
        {
          workspaceId: WORKSPACE_ID,
          title: "Kermesse",
          folderId: "f1",
          tasks: [{ title: "Salle", assigneeId: "bruno" }, { title: "Affiches" }],
        },
        TOKEN,
      );

      expect(repo.create).toHaveBeenCalledWith(
        "alice",
        {
          workspaceId: WORKSPACE_ID,
          title: "Kermesse",
          folderId: "f1",
          conversationId: null,
          tasks: [
            { title: "Salle", assigneeId: "bruno", position: 0 },
            { title: "Affiches", assigneeId: null, position: 1 },
          ],
        },
        TOKEN,
      );
    });

    it("refuse un responsable qui ne fait pas partie de l'espace", async () => {
      const repo = makeRepository();

      await expect(
        new WorkspaceListService(repo).create(
          "alice",
          {
            workspaceId: WORKSPACE_ID,
            title: "K",
            tasks: [{ title: "Salle", assigneeId: "dora" }],
          },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("refuse un dossier qui n'appartient pas à l'espace", async () => {
      const repo = makeRepository();

      await expect(
        new WorkspaceListService(repo).create(
          "alice",
          { workspaceId: WORKSPACE_ID, title: "K", folderId: "perso", tasks: [] },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("refuse de créer une liste dans un espace dont on n'est pas membre", async () => {
      await expect(
        new WorkspaceListService(makeRepository()).create(
          "dora",
          { workspaceId: WORKSPACE_ID, title: "K", tasks: [] },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("update", () => {
    it("range la liste dans un dossier de l'espace", async () => {
      const repo = withList(makeList());

      const list = await new WorkspaceListService(repo).update("list-1", { folderId: "f1" }, TOKEN);

      expect(list.folderId).toBe("f1");
      expect(repo.update).toHaveBeenCalledWith("list-1", { folderId: "f1" }, TOKEN);
    });

    it("sort la liste de son dossier avec un `null` explicite", async () => {
      const repo = withList(makeList({ folderId: "f1" }));

      const list = await new WorkspaceListService(repo).update("list-1", { folderId: null }, TOKEN);

      expect(list.folderId).toBeNull();
    });

    it("répond introuvable pour une liste inconnue", async () => {
      await expect(
        new WorkspaceListService(makeRepository()).update("list-1", { title: "X" }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("addTask", () => {
    it("ajoute la tâche en fin de liste", async () => {
      const repo = withList(
        makeList({ tasks: [makeTask({ position: 0 }), makeTask({ id: "t2", position: 3 })] }),
      );

      await new WorkspaceListService(repo).addTask("alice", "list-1", { title: "Sono" }, TOKEN);

      expect(repo.addTask).toHaveBeenCalledWith(
        "alice",
        "list-1",
        { title: "Sono", assigneeId: null, position: 4 },
        TOKEN,
      );
    });

    it("commence à zéro dans une liste vide", async () => {
      const repo = withList(makeList());

      await new WorkspaceListService(repo).addTask("alice", "list-1", { title: "Sono" }, TOKEN);

      expect(repo.addTask).toHaveBeenCalledWith(
        "alice",
        "list-1",
        expect.objectContaining({ position: 0 }),
        TOKEN,
      );
    });

    it("refuse un responsable hors de l'espace", async () => {
      const repo = withList(makeList());

      await expect(
        new WorkspaceListService(repo).addTask(
          "alice",
          "list-1",
          { title: "Sono", assigneeId: "dora" },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("updateTask", () => {
    it("coche une tâche de la liste", async () => {
      const repo = withList(makeList({ tasks: [makeTask()] }));

      const task = await new WorkspaceListService(repo).updateTask(
        "list-1",
        "t1",
        { done: true },
        TOKEN,
      );

      expect(task.done).toBe(true);
    });

    it("confie une tâche à un membre", async () => {
      const repo = withList(makeList({ tasks: [makeTask()] }));

      await new WorkspaceListService(repo).updateTask(
        "list-1",
        "t1",
        { assigneeId: "bruno" },
        TOKEN,
      );

      expect(repo.updateTask).toHaveBeenCalledWith("t1", { assigneeId: "bruno" }, TOKEN);
    });

    it("refuse une tâche qui n'est pas dans cette liste", async () => {
      const repo = withList(makeList({ tasks: [makeTask()] }));

      await expect(
        new WorkspaceListService(repo).updateTask("list-1", "autre", { done: true }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.updateTask).not.toHaveBeenCalled();
    });
  });

  describe("deleteTask", () => {
    it("supprime une tâche de la liste", async () => {
      const repo = withList(makeList({ tasks: [makeTask()] }));

      await new WorkspaceListService(repo).deleteTask("list-1", "t1", TOKEN);

      expect(repo.deleteTask).toHaveBeenCalledWith("t1", TOKEN);
    });
  });
});
