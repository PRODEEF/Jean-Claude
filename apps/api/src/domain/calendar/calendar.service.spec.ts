import type { CalendarEvent } from "@jc/domain";
import { CalendarService } from "./calendar.service.js";
import type { ICalendarRepository } from "./calendar.repository.interface.js";

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

describe("CalendarService", () => {
  describe("list", () => {
    it("rend les événements de la fenêtre demandée", async () => {
      const events = [makeEvent(), makeEvent({ id: "evt-2", title: "Dentiste" })];
      const repo = makeRepository({ findInRange: jest.fn().mockResolvedValue(events) });
      const range = { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" };

      await expect(new CalendarService(repo).list(range, TOKEN)).resolves.toEqual(events);
      expect(repo.findInRange).toHaveBeenCalledWith(range, TOKEN);
    });

    it("rend une liste vide sur un mois sans rendez-vous", async () => {
      const repo = makeRepository();

      const found = await new CalendarService(repo).list(
        { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
        TOKEN,
      );

      expect(found).toEqual([]);
    });
  });

  describe("create", () => {
    it("accepte un événement sans heure de fin", async () => {
      const repo = makeRepository();

      await new CalendarService(repo).create(
        USER,
        { title: "Appeler la mutuelle", startsAt: "2026-09-08T16:00:00.000Z", allDay: false },
        TOKEN,
      );

      expect(repo.create).toHaveBeenCalled();
    });

    it("refuse un événement dont la fin précède le début", async () => {
      const repo = makeRepository();

      await expect(
        new CalendarService(repo).create(
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
        new CalendarService(repo).create(
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
        new CalendarService(repo).update("evt-1", { endsAt: "2026-09-08T15:00:00.000Z" }, TOKEN),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it("accepte le retrait de l'heure de fin", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeEvent()) });

      await new CalendarService(repo).update("evt-1", { endsAt: null }, TOKEN);

      expect(repo.update).toHaveBeenCalledWith("evt-1", { endsAt: null }, TOKEN);
    });

    it("échoue en 404 sur un événement inexistant", async () => {
      const repo = makeRepository();

      await expect(
        new CalendarService(repo).update("evt-absent", { title: "Kiné" }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("delete", () => {
    it("supprime un événement existant", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeEvent()) });

      await new CalendarService(repo).delete("evt-1", TOKEN);

      expect(repo.delete).toHaveBeenCalledWith("evt-1", TOKEN);
    });

    it("échoue en 404 sur un événement inexistant", async () => {
      const repo = makeRepository();

      await expect(new CalendarService(repo).delete("evt-absent", TOKEN)).rejects.toMatchObject({
        status: 404,
      });
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
