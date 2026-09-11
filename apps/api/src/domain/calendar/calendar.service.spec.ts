import type { CalendarEvent, TaskList } from "@jc/domain";
import { CalendarService } from "./calendar.service.js";
import type { ICalendarRepository } from "./calendar.repository.interface.js";
import type { ITaskRepository } from "../task/task.repository.interface.js";

const TOKEN = "access-token";
const USER = "user-1";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-1",
    title: "Kiné",
    notes: null,
    startsAt: "2026-09-08T16:00:00.000Z",
    endsAt: "2026-09-08T17:00:00.000Z",
    allDay: false,
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

function makeRepository(overrides: Partial<ICalendarRepository> = {}): ICalendarRepository {
  return {
    findInRange: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((_userId, input) => Promise.resolve(makeEvent(input))),
    update: jest.fn().mockResolvedValue(makeEvent()),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeTaskList(overrides: Partial<TaskList> = {}): TaskList {
  return {
    id: "list-1",
    title: "Travaux jardin",
    kind: "todo",
    dueAt: "2026-09-08T00:00:00.000Z",
    dueAllDay: true,
    eventId: "evt-1",
    conversationId: null,
    folderId: null,
    createdByAssistant: true,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

/** Aucune liste rattachée par défaut : c'est le cas de l'immense majorité des événements. */
function makeTaskRepository(overrides: Partial<ITaskRepository> = {}): ITaskRepository {
  return {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByConversation: jest.fn(),
    findByEventId: jest.fn().mockResolvedValue(null),
    createList: jest.fn(),
    updateList: jest.fn().mockImplementation((id: string) => Promise.resolve(makeTaskList({ id }))),
    deleteList: jest.fn(),
    createTask: jest.fn(),
    updateTask: jest.fn(),
    deleteTask: jest.fn(),
    replaceTasks: jest.fn(),
    ...overrides,
  };
}

function makeService(
  repo: ICalendarRepository = makeRepository(),
  tasks: ITaskRepository = makeTaskRepository(),
): CalendarService {
  return new CalendarService(repo, tasks);
}

describe("CalendarService", () => {
  describe("list", () => {
    it("rend les événements de la fenêtre demandée", async () => {
      const events = [makeEvent(), makeEvent({ id: "evt-2", title: "Dentiste" })];
      const repo = makeRepository({ findInRange: jest.fn().mockResolvedValue(events) });
      const range = { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" };

      await expect(makeService(repo).list(range, TOKEN)).resolves.toEqual(events);
      expect(repo.findInRange).toHaveBeenCalledWith(range, TOKEN);
    });

    it("rend une liste vide sur un mois sans rendez-vous", async () => {
      const repo = makeRepository();

      const found = await makeService(repo).list(
        { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
        TOKEN,
      );

      expect(found).toEqual([]);
    });
  });

  describe("create", () => {
    it("accepte un événement sans heure de fin", async () => {
      const repo = makeRepository();

      await makeService(repo).create(
        USER,
        { title: "Appeler la mutuelle", startsAt: "2026-09-08T16:00:00.000Z", allDay: false },
        TOKEN,
      );

      expect(repo.create).toHaveBeenCalled();
    });

    it("refuse un événement dont la fin précède le début", async () => {
      const repo = makeRepository();

      await expect(
        makeService(repo).create(
          USER,
          {
            title: "Kiné",
            startsAt: "2026-09-08T17:00:00.000Z",
            endsAt: "2026-09-08T16:00:00.000Z",
            allDay: false,
          },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("refuse un événement dont la fin coïncide avec le début", async () => {
      const repo = makeRepository();

      await expect(
        makeService(repo).create(
          USER,
          {
            title: "Kiné",
            startsAt: "2026-09-08T16:00:00.000Z",
            endsAt: "2026-09-08T16:00:00.000Z",
            allDay: false,
          },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("update", () => {
    it("refuse une fin avancée devant le début resté en base", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeEvent()) });

      await expect(
        makeService(repo).update("evt-1", { endsAt: "2026-09-08T15:00:00.000Z" }, TOKEN),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it("accepte le retrait de l'heure de fin", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeEvent()) });

      await makeService(repo).update("evt-1", { endsAt: null }, TOKEN);

      expect(repo.update).toHaveBeenCalledWith("evt-1", { endsAt: null }, TOKEN);
    });

    it("répercute la nouvelle date sur la todoliste rattachée à l'événement (A.3)", async () => {
      const nouvelleDate = "2026-09-10T16:00:00.000Z";
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeEvent({ endsAt: null })),
        update: jest.fn().mockResolvedValue(makeEvent({ startsAt: nouvelleDate, endsAt: null })),
      });
      const tasks = makeTaskRepository({
        findByEventId: jest.fn().mockResolvedValue(makeTaskList()),
      });

      await makeService(repo, tasks).update("evt-1", { startsAt: nouvelleDate }, TOKEN);

      expect(tasks.findByEventId).toHaveBeenCalledWith("evt-1", TOKEN);
      expect(tasks.updateList).toHaveBeenCalledWith(
        "list-1",
        { dueAt: nouvelleDate },
        TOKEN,
      );
    });

    it("laisse les todolistes tranquilles quand l'événement n'en représente aucune", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeEvent({ endsAt: null })),
      });
      const tasks = makeTaskRepository();

      await makeService(repo, tasks).update(
        "evt-1",
        { startsAt: "2026-09-10T16:00:00.000Z" },
        TOKEN,
      );

      expect(tasks.updateList).not.toHaveBeenCalled();
    });

    it("ne cherche pas de todoliste rattachée quand la date ne change pas", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeEvent()) });
      const tasks = makeTaskRepository();

      await makeService(repo, tasks).update("evt-1", { title: "Kiné (reporté)" }, TOKEN);

      expect(tasks.findByEventId).not.toHaveBeenCalled();
      expect(tasks.updateList).not.toHaveBeenCalled();
    });

    it("échoue en 404 sur un événement inexistant", async () => {
      const repo = makeRepository();

      await expect(
        makeService(repo).update("evt-absent", { title: "Kiné" }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("delete", () => {
    it("supprime un événement existant", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeEvent()) });

      await makeService(repo).delete("evt-1", TOKEN);

      expect(repo.delete).toHaveBeenCalledWith("evt-1", TOKEN);
    });

    it("échoue en 404 sur un événement inexistant", async () => {
      const repo = makeRepository();

      await expect(makeService(repo).delete("evt-absent", TOKEN)).rejects.toMatchObject({
        status: 404,
      });
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
