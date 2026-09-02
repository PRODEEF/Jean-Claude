import type { Task, TaskList, TaskListWithTasks } from "@jc/domain";
import type { ITaskRepository } from "./task.repository.interface.js";
import { TaskService } from "./task.service.js";

const TOKEN = "access-token";
const USER = "user-1";
const LIST = "list-1";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    listId: LIST,
    title: "Acheter du terreau",
    notes: null,
    done: false,
    completedAt: null,
    dueAt: null,
    eventId: null,
    position: 0,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

function makeList(overrides: Partial<TaskListWithTasks> = {}): TaskListWithTasks {
  return {
    id: LIST,
    title: "Jardin",
    kind: "todo",
    conversationId: null,
    folderId: null,
    createdByAssistant: false,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    tasks: [],
    ...overrides,
  };
}

function makeRepository(overrides: Partial<ITaskRepository> = {}): ITaskRepository {
  return {
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(makeList()),
    createList: jest
      .fn()
      .mockImplementation((_userId, input: TaskList) => Promise.resolve(makeList(input))),
    updateList: jest.fn().mockResolvedValue(makeList()),
    deleteList: jest.fn().mockResolvedValue(undefined),
    createTask: jest
      .fn()
      .mockImplementation((_userId, listId, input: Task, position: number) =>
        Promise.resolve(makeTask({ ...input, listId, position })),
      ),
    updateTask: jest.fn().mockResolvedValue(makeTask()),
    deleteTask: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("TaskService", () => {
  describe("list", () => {
    it("rend toutes les listes, tous dossiers confondus", async () => {
      const lists = [makeList(), makeList({ id: "list-2", title: "Courses", kind: "shopping" })];
      const repo = makeRepository({ findAll: jest.fn().mockResolvedValue(lists) });

      await expect(new TaskService(repo).list(TOKEN)).resolves.toEqual(lists);
    });

    it("rend une liste vide quand aucune todoliste n'existe encore", async () => {
      await expect(new TaskService(makeRepository()).list(TOKEN)).resolves.toEqual([]);
    });
  });

  describe("createList", () => {
    it("crée une liste sans exiger de dossier", async () => {
      const repo = makeRepository();

      const created = await new TaskService(repo).createList(
        USER,
        { title: "Jardin", kind: "todo" },
        TOKEN,
      );

      expect(created.folderId).toBeNull();
      expect(repo.createList).toHaveBeenCalledWith(
        USER,
        { title: "Jardin", kind: "todo" },
        TOKEN,
      );
    });
  });

  describe("updateList", () => {
    it("refuse de modifier une liste qui n'existe pas", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(null) });

      await expect(
        new TaskService(repo).updateList(LIST, { title: "Potager" }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.updateList).not.toHaveBeenCalled();
    });
  });

  describe("addTask", () => {
    it("ajoute la tâche à la suite des positions déjà prises", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(
          makeList({
            tasks: [makeTask({ position: 0 }), makeTask({ id: "task-2", position: 4 })],
          }),
        ),
      });

      await new TaskService(repo).addTask(USER, LIST, { title: "Tailler la haie" }, TOKEN);

      expect(repo.createTask).toHaveBeenCalledWith(
        USER,
        LIST,
        { title: "Tailler la haie" },
        5,
        TOKEN,
      );
    });

    it("place la première tâche d'une liste vide en position 0", async () => {
      const repo = makeRepository();

      await new TaskService(repo).addTask(USER, LIST, { title: "Semer" }, TOKEN);

      expect(repo.createTask).toHaveBeenCalledWith(USER, LIST, { title: "Semer" }, 0, TOKEN);
    });

    it("refuse d'ajouter une tâche à une liste introuvable", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(null) });

      await expect(
        new TaskService(repo).addTask(USER, LIST, { title: "Semer" }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.createTask).not.toHaveBeenCalled();
    });
  });

  describe("updateTask", () => {
    it("horodate la complétion quand la tâche est cochée", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ tasks: [makeTask()] })),
      });

      await new TaskService(repo).updateTask(LIST, "task-1", { done: true }, TOKEN);

      const patch = (repo.updateTask as jest.Mock).mock.calls[0][2] as { completedAt: string };
      expect(typeof patch.completedAt).toBe("string");
    });

    it("efface la date de complétion quand la tâche est décochée", async () => {
      const repo = makeRepository({
        findById: jest
          .fn()
          .mockResolvedValue(
            makeList({ tasks: [makeTask({ done: true, completedAt: "2026-09-01T09:00:00.000Z" })] }),
          ),
      });

      await new TaskService(repo).updateTask(LIST, "task-1", { done: false }, TOKEN);

      expect(repo.updateTask).toHaveBeenCalledWith(
        LIST,
        "task-1",
        { done: false, completedAt: null },
        TOKEN,
      );
    });

    it("ne touche pas à la date de complétion quand seul le titre change", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ tasks: [makeTask()] })),
      });

      await new TaskService(repo).updateTask(LIST, "task-1", { title: "Semer des radis" }, TOKEN);

      expect(repo.updateTask).toHaveBeenCalledWith(
        LIST,
        "task-1",
        { title: "Semer des radis" },
        TOKEN,
      );
    });

    it("refuse de modifier une tâche qui n'appartient pas à la liste", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ tasks: [makeTask()] })),
      });

      await expect(
        new TaskService(repo).updateTask(LIST, "task-99", { done: true }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.updateTask).not.toHaveBeenCalled();
    });
  });

  describe("deleteTask", () => {
    it("supprime une tâche de sa liste", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ tasks: [makeTask()] })),
      });

      await new TaskService(repo).deleteTask(LIST, "task-1", TOKEN);

      expect(repo.deleteTask).toHaveBeenCalledWith(LIST, "task-1", TOKEN);
    });

    it("refuse de supprimer une tâche introuvable", async () => {
      const repo = makeRepository();

      await expect(
        new TaskService(repo).deleteTask(LIST, "task-1", TOKEN),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.deleteTask).not.toHaveBeenCalled();
    });
  });
});
