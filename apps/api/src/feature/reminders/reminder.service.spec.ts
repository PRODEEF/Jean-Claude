import { ReminderService } from "./reminder.service.js";
import type { IReminderRepository } from "./reminder.repository.interface.js";
import type { ReminderEvent } from "./reminder-schedule.js";

const NOW = new Date("2026-11-12T17:35:00.000Z");

function makeEvent(overrides: Partial<ReminderEvent> = {}): ReminderEvent {
  return {
    userId: "user-1",
    id: "evt-1",
    title: "Kiné",
    notes: null,
    startsAt: "2026-11-12T18:00:00.000Z",
    endsAt: "2026-11-12T19:00:00.000Z",
    allDay: false,
    rrule: null,
    reminderMinutesBefore: 30,
    folderId: null,
    conversationId: null,
    createdByAssistant: false,
    createdAt: "2026-11-01T08:00:00.000Z",
    updatedAt: "2026-11-01T08:00:00.000Z",
    ...overrides,
  };
}

function makeRepository(overrides: Partial<IReminderRepository> = {}): IReminderRepository {
  return {
    findRemindable: jest.fn().mockResolvedValue([]),
    findRecipients: jest
      .fn()
      .mockResolvedValue([{ userId: "user-1", timezone: "Europe/Paris", remindInChannel: true }]),
    claim: jest.fn().mockResolvedValue(true),
    release: jest.fn().mockResolvedValue(undefined),
    postInChannel: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("ReminderService", () => {
  it("écrit dans le canal le rappel d'un rendez-vous arrivé à l'heure", async () => {
    const repo = makeRepository({ findRemindable: jest.fn().mockResolvedValue([makeEvent()]) });

    const run = await new ReminderService(repo).run(NOW);

    expect(run).toEqual({ sent: 1, failed: 0 });
    expect(repo.postInChannel).toHaveBeenCalledWith(
      "user-1",
      "Rappel : Kiné, à 19h (dans 30 minutes).",
    );
  });

  it("ne fait rien quand aucun rappel n'est dû", async () => {
    const repo = makeRepository();

    await expect(new ReminderService(repo).run(NOW)).resolves.toEqual({ sent: 0, failed: 0 });
    expect(repo.findRecipients).not.toHaveBeenCalled();
    expect(repo.postInChannel).not.toHaveBeenCalled();
  });

  it("n'écrit pas deux fois le même rappel", async () => {
    const repo = makeRepository({
      findRemindable: jest.fn().mockResolvedValue([makeEvent()]),
      claim: jest.fn().mockResolvedValue(false),
    });

    const run = await new ReminderService(repo).run(NOW);

    expect(run).toEqual({ sent: 0, failed: 0 });
    expect(repo.postInChannel).not.toHaveBeenCalled();
  });

  it("respecte le réglage de qui ne veut pas de rappel dans le canal", async () => {
    const repo = makeRepository({
      findRemindable: jest.fn().mockResolvedValue([makeEvent()]),
      findRecipients: jest
        .fn()
        .mockResolvedValue([
          { userId: "user-1", timezone: "Europe/Paris", remindInChannel: false },
        ]),
    });

    await new ReminderService(repo).run(NOW);

    expect(repo.claim).not.toHaveBeenCalled();
    expect(repo.postInChannel).not.toHaveBeenCalled();
  });

  it("rend la réservation quand l'écriture échoue, pour retenter au passage suivant", async () => {
    const repo = makeRepository({
      findRemindable: jest.fn().mockResolvedValue([makeEvent()]),
      postInChannel: jest.fn().mockRejectedValue(new Error("base indisponible")),
    });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const run = await new ReminderService(repo).run(NOW);

    expect(run).toEqual({ sent: 0, failed: 1 });
    expect(repo.release).toHaveBeenCalledWith("evt-1", "2026-11-12T18:00:00.000Z");
  });

  it("n'arrête pas les autres rappels quand l'un échoue", async () => {
    const repo = makeRepository({
      findRemindable: jest
        .fn()
        .mockResolvedValue([
          makeEvent({ id: "evt-1" }),
          makeEvent({ id: "evt-2", title: "Dentiste" }),
        ]),
      postInChannel: jest
        .fn()
        .mockRejectedValueOnce(new Error("panne"))
        .mockResolvedValueOnce(undefined),
    });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const run = await new ReminderService(repo).run(NOW);

    expect(run).toEqual({ sent: 1, failed: 1 });
  });
});
