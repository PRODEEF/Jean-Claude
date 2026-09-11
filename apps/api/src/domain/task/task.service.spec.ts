import type { CalendarEvent, Task, TaskList, TaskListWithTasks } from "@jc/domain";
import type { ICalendarRepository } from "../calendar/calendar.repository.interface.js";
import type { IUserRepository, ProfileRecord } from "../user/user.repository.interface.js";
import type { ITaskRepository, TaskRowInput } from "./task.repository.interface.js";
import { TaskService } from "./task.service.js";

const TOKEN = "access-token";
const USER = "user-1";
const LIST = "list-1";
const EVENT = "event-1";

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
    dueAllDay: null,
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
    findAll: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    findById: jest.fn().mockResolvedValue(makeList()),
    findByConversation: jest.fn().mockResolvedValue([]),
    findByEventId: jest.fn().mockResolvedValue(null),
    createList: jest
      .fn()
      .mockImplementation((_userId, input: TaskList) => Promise.resolve(makeList(input))),
    // Renvoie la liste telle qu'elle sera en base : le service s'appuie
    // désormais sur ce que l'écriture a réellement produit pour décider s'il
    // doit répercuter quoi que ce soit sur le rendez-vous lié.
    updateList: jest
      .fn()
      .mockImplementation((_id, patch: Partial<TaskList>) => Promise.resolve(makeList(patch))),
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
      .mockImplementation((_userId, listId: string, content: { rows: TaskRowInput[] }) =>
        Promise.resolve(content.rows.map((row) => makeTask({ ...row, listId }))),
      ),
    ...overrides,
  };
}

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: EVENT,
    title: "Jardin",
    notes: null,
    startsAt: "2026-09-12T00:00:00.000Z",
    endsAt: null,
    allDay: true,
    rrule: null,
    reminderMinutesBefore: null,
    folderId: null,
    conversationId: null,
    createdByAssistant: false,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

function makeCalendarRepository(overrides: Partial<ICalendarRepository> = {}): ICalendarRepository {
  return {
    findInRange: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(makeEvent()),
    update: jest.fn().mockResolvedValue(makeEvent()),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeProfile(overrides: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    id: USER,
    displayName: "Clarisse",
    memory: null,
    onboardingCompletedAt: "2026-08-31T09:00:00.000Z",
    createdAt: "2026-08-31T08:00:00.000Z",
    preferences: {
      assistantName: "Jean-Claude",
      assistantColor: "#6366F1",
      theme: "system",
      flatBanner: false,
      timezone: "Europe/Paris",
      llmModel: null,
      scope: {
        morningReminders: true,
        folderOrganization: true,
        structureSuggestions: true,
        proactiveTaskDetection: true,
        proactiveScheduling: true,
      },
    },
    ...overrides,
  };
}

function makeUserRepository(overrides: Partial<IUserRepository> = {}): IUserRepository {
  return {
    findById: jest.fn().mockResolvedValue(makeProfile()),
    update: jest.fn().mockResolvedValue(makeProfile()),
    completeOnboarding: jest.fn().mockResolvedValue(makeProfile()),
    deleteAccount: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Service sous test, avec des doubles par défaut pour ses dépendances de
 * synchronisation — la plupart des tests ne portent que sur `lists`.
 */
function makeService(
  lists: ITaskRepository = makeRepository(),
  events: ICalendarRepository = makeCalendarRepository(),
  users: IUserRepository = makeUserRepository(),
): TaskService {
  return new TaskService(lists, events, users);
}

describe("TaskService", () => {
  describe("list", () => {
    it("rend une page de listes, tous dossiers confondus", async () => {
      const lists = [makeList(), makeList({ id: "list-2", title: "Courses", kind: "shopping" })];
      const page = { items: lists, nextCursor: "2026-09-01T08:00:00.000Z" };
      const repo = makeRepository({ findAll: jest.fn().mockResolvedValue(page) });

      await expect(makeService(repo).list(TOKEN, { limit: 30 })).resolves.toEqual(page);
    });

    it("rend une page vide quand aucune todoliste n'existe encore", async () => {
      await expect(makeService(makeRepository()).list(TOKEN, { limit: 30 })).resolves.toEqual({
        items: [],
        nextCursor: null,
      });
    });

    it("transmet le curseur et la limite reçus au Repository", async () => {
      const repo = makeRepository();

      await makeService(repo).list(TOKEN, { cursor: "2026-09-01T08:00:00.000Z", limit: 10 });

      expect(repo.findAll).toHaveBeenCalledWith(TOKEN, {
        cursor: "2026-09-01T08:00:00.000Z",
        limit: 10,
      });
    });
  });

  describe("createList", () => {
    it("crée une liste sans exiger de dossier", async () => {
      const repo = makeRepository();

      const created = await makeService(repo).createList(
        USER,
        { title: "Jardin", kind: "todo" },
        TOKEN,
      );

      expect(created.folderId).toBeNull();
      expect(repo.createList).toHaveBeenCalledWith(USER, { title: "Jardin", kind: "todo" }, TOKEN);
    });

    it("date la liste entière et non ses lignes", async () => {
      const repo = makeRepository();

      const created = await makeService(repo).createList(
        USER,
        { title: "Courses", kind: "shopping", dueAt: "2026-09-12T00:00:00.000Z" },
        TOKEN,
      );

      expect(created.dueAt).toBe("2026-09-12T00:00:00.000Z");
    });

    it("retient l'intention de saisie plutôt que de la relire dans l'heure", async () => {
      const repo = makeRepository();

      // Minuit heure de Paris, mais l'utilisateur a bien tapé une heure — un
      // appareil hors d'Europe/Paris produit couramment ce cas. Redéduire le
      // moment de l'horodatage le contredirait.
      await makeService(repo).createList(
        USER,
        {
          title: "Courses",
          kind: "shopping",
          dueAt: "2026-09-11T22:00:00.000Z",
          dueAllDay: false,
        },
        TOKEN,
      );

      expect(repo.createList).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({ dueAllDay: false }),
        TOKEN,
      );
    });

    it("déduit le moment de l'heure murale du profil quand l'appelant se tait", async () => {
      const repo = makeRepository();

      // 9h heure de Paris (UTC+2 en septembre) : l'assistant ne produit qu'un
      // instant, c'est au serveur de dire s'il vise un créneau.
      await makeService(repo).createList(
        USER,
        { title: "Courses", kind: "shopping", dueAt: "2026-09-12T07:00:00.000Z" },
        TOKEN,
      );

      expect(repo.createList).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({ dueAllDay: false }),
        TOKEN,
      );
    });

    it("tient pour la journée entière une échéance à minuit dans le fuseau du profil", async () => {
      const repo = makeRepository();

      await makeService(repo).createList(
        USER,
        { title: "Courses", kind: "shopping", dueAt: "2026-09-11T22:00:00.000Z" },
        TOKEN,
      );

      expect(repo.createList).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({ dueAllDay: true }),
        TOKEN,
      );
    });

    it("refuse une échéance dont le jour civil est déjà révolu", async () => {
      const repo = makeRepository();

      await expect(
        makeService(repo).createList(
          USER,
          { title: "Courses", kind: "shopping", dueAt: "2020-01-01T00:00:00.000Z" },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.createList).not.toHaveBeenCalled();
    });

    it("accepte une échéance aujourd'hui, même à une heure déjà passée", async () => {
      const repo = makeRepository();
      const today = new Date().toISOString();

      await makeService(repo).createList(
        USER,
        { title: "Courses", kind: "shopping", dueAt: today },
        TOKEN,
      );

      expect(repo.createList).toHaveBeenCalled();
    });
  });

  describe("linkEvent", () => {
    it("rattache la liste au créneau posé pour elle", async () => {
      const repo = makeRepository();

      await makeService(repo).linkEvent(LIST, "event-1", TOKEN);

      expect(repo.updateList).toHaveBeenCalledWith(LIST, { eventId: "event-1" }, TOKEN);
    });

    it("refuse de rattacher un créneau à une liste introuvable", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(null) });

      await expect(makeService(repo).linkEvent(LIST, "event-1", TOKEN)).rejects.toMatchObject({
        status: 404,
      });
      expect(repo.updateList).not.toHaveBeenCalled();
    });
  });

  describe("replaceTasks", () => {
    /** Ce que le service a demandé d'écrire, tel que le Repository le reçoit. */
    function written(repo: ITaskRepository): { rows: TaskRowInput[]; removed: string[] } {
      return (repo.replaceTasks as jest.Mock).mock.calls[0][2];
    }

    it("range une ligne indentée sous la dernière ligne de premier niveau", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ tasks: [makeTask()] })),
      });

      await makeService(repo).replaceTasks(
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

      const { rows } = written(repo);
      expect(rows[0]).toMatchObject({ id: "task-1", parentId: null, position: 0 });
      expect(rows[1]).toMatchObject({ parentId: "task-1", position: 1 });
      expect(rows[2]).toMatchObject({ parentId: "task-1", position: 2 });
    });

    it("remonte au premier niveau une liste qui commence par une ligne indentée", async () => {
      const repo = makeRepository();

      await makeService(repo).replaceTasks(
        USER,
        LIST,
        { items: [{ title: "Poncer", depth: 1 }] },
        TOKEN,
      );

      const { rows } = written(repo);
      expect(rows[0]?.parentId).toBeNull();
    });

    it("traite comme neuve une ligne dont l'identifiant vient d'une autre liste", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ tasks: [makeTask()] })),
      });

      await makeService(repo).replaceTasks(
        USER,
        LIST,
        { items: [{ id: "00000000-0000-4000-8000-000000000099", title: "Semer", depth: 0 }] },
        TOKEN,
      );

      const { rows } = written(repo);
      expect(rows[0]?.id).not.toBe("00000000-0000-4000-8000-000000000099");
    });

    it("accepte de vider entièrement une liste", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ tasks: [makeTask()] })),
      });

      await makeService(repo).replaceTasks(USER, LIST, { items: [] }, TOKEN);

      expect(repo.replaceTasks).toHaveBeenCalledWith(
        USER,
        LIST,
        { rows: [], removed: ["task-1"] },
        TOKEN,
      );
    });

    it("conserve la complétion et les notes d'une ligne que l'éditeur renvoie", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(
          makeList({
            tasks: [
              makeTask({
                done: true,
                completedAt: "2026-09-02T09:00:00.000Z",
                notes: "Au rayon jardinage",
              }),
            ],
          }),
        ),
      });

      await makeService(repo).replaceTasks(
        USER,
        LIST,
        { items: [{ id: "task-1", title: "Acheter du terreau universel", depth: 0 }] },
        TOKEN,
      );

      // L'éditeur ne transporte que le texte et l'indentation : renommer une
      // ligne ne doit ni la décocher ni lui faire perdre ses notes.
      expect(written(repo).rows[0]).toMatchObject({
        title: "Acheter du terreau universel",
        done: true,
        completedAt: "2026-09-02T09:00:00.000Z",
        notes: "Au rayon jardinage",
      });
    });

    it("laisse une ligne neuve à faire, sans notes ni date de complétion", async () => {
      const repo = makeRepository();

      await makeService(repo).replaceTasks(
        USER,
        LIST,
        { items: [{ title: "Semer", depth: 0 }] },
        TOKEN,
      );

      expect(written(repo).rows[0]).toMatchObject({
        done: false,
        completedAt: null,
        notes: null,
      });
    });

    it("désigne comme retirées les seules lignes que l'éditeur ne renvoie plus", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(
          makeList({
            tasks: [makeTask(), makeTask({ id: "task-2", title: "Poncer", position: 1 })],
          }),
        ),
      });

      await makeService(repo).replaceTasks(
        USER,
        LIST,
        { items: [{ id: "task-2", title: "Poncer", depth: 0 }] },
        TOKEN,
      );

      expect(written(repo).removed).toEqual(["task-1"]);
    });

    it("refuse de réécrire une liste introuvable", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(null) });

      await expect(
        makeService(repo).replaceTasks(
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
        makeService(repo).updateList(USER, LIST, { title: "Potager" }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.updateList).not.toHaveBeenCalled();
    });

    it("ne touche à aucun rendez-vous quand la liste n'en porte pas", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeList({ eventId: null })) });
      const events = makeCalendarRepository();

      await makeService(repo, events).updateList(
        USER,
        LIST,
        { dueAt: "2026-09-12T09:00:00.000Z" },
        TOKEN,
      );

      expect(events.update).not.toHaveBeenCalled();
    });

    it("refuse de reculer l'échéance dans un jour déjà révolu", async () => {
      const repo = makeRepository();

      await expect(
        makeService(repo).updateList(USER, LIST, { dueAt: "2020-01-01T00:00:00.000Z" }, TOKEN),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.updateList).not.toHaveBeenCalled();
    });

    it("laisse inchangée une échéance déjà passée quand on ne change pas de jour", async () => {
      const overdue = "2020-01-01T00:00:00.000Z";
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ dueAt: overdue })),
        updateList: jest.fn().mockResolvedValue(makeList({ dueAt: overdue, title: "Potager" })),
      });

      await makeService(repo).updateList(USER, LIST, { title: "Potager", dueAt: overdue }, TOKEN);

      expect(repo.updateList).toHaveBeenCalled();
    });

    it("répercute la nouvelle échéance sur le rendez-vous déjà lié, à heure précise", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ eventId: EVENT })),
      });
      const events = makeCalendarRepository();

      // 9h heure de Paris (UTC+2 en septembre) = 7h UTC. Le profil par défaut
      // (makeProfile) est déjà sur ce fuseau.
      await makeService(repo, events).updateList(
        USER,
        LIST,
        { dueAt: "2026-09-12T07:00:00.000Z" },
        TOKEN,
      );

      expect(events.update).toHaveBeenCalledWith(
        EVENT,
        { startsAt: "2026-09-12T07:00:00.000Z", allDay: false },
        TOKEN,
      );
    });

    it("garde le rendez-vous lié journée entière quand la nouvelle échéance ne porte pas d'heure", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ eventId: EVENT })),
      });
      const events = makeCalendarRepository();

      // Minuit heure de Paris (UTC+2 en septembre) = 22h UTC la veille.
      await makeService(repo, events).updateList(
        USER,
        LIST,
        { dueAt: "2026-09-11T22:00:00.000Z" },
        TOKEN,
      );

      expect(events.update).toHaveBeenCalledWith(
        EVENT,
        { startsAt: "2026-09-11T22:00:00.000Z", allDay: true },
        TOKEN,
      );
    });

    it("ne répercute rien quand l'échéance n'est pas modifiée", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ eventId: EVENT })),
      });
      const events = makeCalendarRepository();

      await makeService(repo, events).updateList(USER, LIST, { title: "Potager" }, TOKEN);

      expect(events.update).not.toHaveBeenCalled();
    });

    it("efface le moment avec l'échéance", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ dueAt: "2026-09-12T07:00:00.000Z" })),
      });

      // Les deux colonnes vont ensemble : une liste sans échéance n'a pas de
      // moment, et la base refuse le couple dépareillé.
      await makeService(repo).updateList(USER, LIST, { dueAt: null }, TOKEN);

      expect(repo.updateList).toHaveBeenCalledWith(
        LIST,
        expect.objectContaining({ dueAt: null, dueAllDay: null }),
        TOKEN,
      );
    });

    it("refuse d'effacer l'échéance d'une liste qui représente un rendez-vous", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ eventId: EVENT })),
      });
      const events = makeCalendarRepository();

      await expect(
        makeService(repo, events).updateList(USER, LIST, { dueAt: null }, TOKEN),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.updateList).not.toHaveBeenCalled();
      expect(events.update).not.toHaveBeenCalled();
    });

    it("garde la nouvelle échéance de la liste même si le rendez-vous lié a disparu entre-temps", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ eventId: EVENT })),
      });
      const events = makeCalendarRepository({
        update: jest.fn().mockRejectedValue(new Error("Événement introuvable.")),
      });

      const updated = await makeService(repo, events).updateList(
        USER,
        LIST,
        { dueAt: "2026-09-12T07:00:00.000Z" },
        TOKEN,
      );

      expect(updated).toBeDefined();
      jest.restoreAllMocks();
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

      await makeService(repo).addTask(USER, LIST, { title: "Tailler la haie" }, TOKEN);

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

      await makeService(repo).addTask(USER, LIST, { title: "Semer" }, TOKEN);

      expect(repo.createTask).toHaveBeenCalledWith(USER, LIST, { title: "Semer" }, 0, TOKEN);
    });

    it("refuse d'ajouter une tâche à une liste introuvable", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(null) });

      await expect(
        makeService(repo).addTask(USER, LIST, { title: "Semer" }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.createTask).not.toHaveBeenCalled();
    });
  });

  describe("updateTask", () => {
    it("horodate la complétion quand la tâche est cochée", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ tasks: [makeTask()] })),
      });

      await makeService(repo).updateTask(LIST, "task-1", { done: true }, TOKEN);

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

      await makeService(repo).updateTask(LIST, "task-1", { done: false }, TOKEN);

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

      await makeService(repo).updateTask(LIST, "task-1", { title: "Semer des radis" }, TOKEN);

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
        makeService(repo).updateTask(LIST, "task-99", { done: true }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.updateTask).not.toHaveBeenCalled();
    });
  });

  describe("deleteTask", () => {
    it("supprime une tâche de sa liste", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeList({ tasks: [makeTask()] })),
      });

      await makeService(repo).deleteTask(LIST, "task-1", TOKEN);

      expect(repo.deleteTask).toHaveBeenCalledWith(LIST, "task-1", TOKEN);
    });

    it("refuse de supprimer une tâche introuvable", async () => {
      const repo = makeRepository();

      await expect(makeService(repo).deleteTask(LIST, "task-1", TOKEN)).rejects.toMatchObject({
        status: 404,
      });
      expect(repo.deleteTask).not.toHaveBeenCalled();
    });
  });
});
