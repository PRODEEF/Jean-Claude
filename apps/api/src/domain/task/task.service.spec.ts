import type { Task, TaskList, TaskListWithTasks } from "@jc/domain";
import type { ITaskRepository, TaskRowInput } from "./task.repository.interface.js";
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
    parentId: null,
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
    dueAt: null,
    eventId: null,
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
    findByConversation: jest.fn().mockResolvedValue([]),
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
    replaceTasks: jest
      .fn()
      .mockImplementation((_userId, listId: string, rows: TaskRowInput[]) =>
        Promise.resolve(rows.map((row) => makeTask({ ...row, listId }))),
      ),
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
      expect(repo.createList).toHaveBeenCalledWith(USER, { title: "Jardin", kind: "todo" }, TOKEN);
    });

    it("date la liste entière et non ses lignes", async () => {
      const repo = makeRepository();

      const created = await new TaskService(repo).createList(
        USER,
        { title: "Courses", kind: "shopping", dueAt: "2026-09-05T00:00:00.000Z" },
        TOKEN,
      );

      expect(created.dueAt).toBe("2026-09-05T00:00:00.000Z");
    });
  });

  describe("linkEvent", () => {
    it("rattache la liste au créneau posé pour elle", async () => {
      const repo = makeRepository();

      await new TaskService(repo).linkEvent(LIST, "event-1", TOKEN);

      expect(repo.updateList).toHaveBeenCalledWith(LIST, { eventId: "event-1" }, TOKEN);
    });

    it("refuse de rattacher un créneau à une liste introuvable", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(null) });

      await expect(new TaskService(repo).linkEvent(LIST, "event-1", TOKEN)).rejects.toMatchObject({
        status: 404,
      });
      expect(repo.updateList).not.toHaveBeenCalled();
    });
  });

  describe("replaceTasks", () => {
    it("range une ligne indentée sous la dernière ligne de premier niveau", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ tasks: [makeTask()] })),
      });

      await new TaskService(repo).replaceTasks(
        USER,
        LIST,
        {
          items: [
            { id: "task-1", title: "Peindre la chambre", depth: 0 },
            { title: "Acheter un rouleau", depth: 1 },
            { title: "Poncer", depth: 1 },
          ],
        },
        TOKEN,
      );

      const rows = (repo.replaceTasks as jest.Mock).mock.calls[0][2] as TaskRowInput[];
      expect(rows[0]).toMatchObject({ id: "task-1", parentId: null, position: 0 });
      expect(rows[1]).toMatchObject({ parentId: "task-1", position: 1 });
      expect(rows[2]).toMatchObject({ parentId: "task-1", position: 2 });
    });

    it("remonte au premier niveau une liste qui commence par une ligne indentée", async () => {
      const repo = makeRepository();

      await new TaskService(repo).replaceTasks(
        USER,
        LIST,
        { items: [{ title: "Poncer", depth: 1 }] },
        TOKEN,
      );

      const rows = (repo.replaceTasks as jest.Mock).mock.calls[0][2] as TaskRowInput[];
      expect(rows[0]?.parentId).toBeNull();
    });

    it("traite comme neuve une ligne dont l'identifiant vient d'une autre liste", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ tasks: [makeTask()] })),
      });

      await new TaskService(repo).replaceTasks(
        USER,
        LIST,
        { items: [{ id: "00000000-0000-4000-8000-000000000099", title: "Semer", depth: 0 }] },
        TOKEN,
      );

      const rows = (repo.replaceTasks as jest.Mock).mock.calls[0][2] as TaskRowInput[];
      expect(rows[0]?.id).not.toBe("00000000-0000-4000-8000-000000000099");
    });

    it("accepte de vider entièrement une liste", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ tasks: [makeTask()] })),
      });

      await new TaskService(repo).replaceTasks(USER, LIST, { items: [] }, TOKEN);

      expect(repo.replaceTasks).toHaveBeenCalledWith(USER, LIST, [], TOKEN);
    });

    it("refuse de réécrire une liste introuvable", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(null) });

      await expect(
        new TaskService(repo).replaceTasks(
          USER,
          LIST,
          { items: [{ title: "Semer", depth: 0 }] },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.replaceTasks).not.toHaveBeenCalled();
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
            makeList({
              tasks: [makeTask({ done: true, completedAt: "2026-09-01T09:00:00.000Z" })],
            }),
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

      await expect(new TaskService(repo).deleteTask(LIST, "task-1", TOKEN)).rejects.toMatchObject({
        status: 404,
      });
      expect(repo.deleteTask).not.toHaveBeenCalled();
    });
  });
});
