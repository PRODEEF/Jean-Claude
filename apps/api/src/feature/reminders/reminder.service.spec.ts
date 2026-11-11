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
    findRecipients: jest.fn().mockResolvedValue([
      {
        userId: "user-1",
        timezone: "Europe/Paris",
        remindInChannel: true,
        remindByEmail: false,
        email: "yann@example.com",
      },
    ]),
    claim: jest.fn().mockResolvedValue(true),
    release: jest.fn().mockResolvedValue(undefined),
    postInChannel: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const mailer = jest.fn().mockResolvedValue(undefined);

beforeEach(() => mailer.mockClear());

describe("ReminderService", () => {
  it("écrit dans le canal le rappel d'un rendez-vous arrivé à l'heure", async () => {
    const repo = makeRepository({ findRemindable: jest.fn().mockResolvedValue([makeEvent()]) });

    const run = await new ReminderService(repo, mailer).run(NOW);

    expect(run).toEqual({ sent: 1, failed: 0 });
    expect(repo.postInChannel).toHaveBeenCalledWith(
      "user-1",
      "Rappel : Kiné, à 19h (dans 30 minutes).",
    );
  });

  it("ne fait rien quand aucun rappel n'est dû", async () => {
    const repo = makeRepository();

    await expect(new ReminderService(repo, mailer).run(NOW)).resolves.toEqual({
      sent: 0,
      failed: 0,
    });
    expect(repo.findRecipients).not.toHaveBeenCalled();
    expect(repo.postInChannel).not.toHaveBeenCalled();
  });

  it("n'écrit pas deux fois le même rappel", async () => {
    const repo = makeRepository({
      findRemindable: jest.fn().mockResolvedValue([makeEvent()]),
      claim: jest.fn().mockResolvedValue(false),
    });

    const run = await new ReminderService(repo, mailer).run(NOW);

    expect(run).toEqual({ sent: 0, failed: 0 });
    expect(repo.postInChannel).not.toHaveBeenCalled();
  });

  it("respecte le réglage de qui ne veut pas de rappel dans le canal", async () => {
    const repo = makeRepository({
      findRemindable: jest.fn().mockResolvedValue([makeEvent()]),
      findRecipients: jest.fn().mockResolvedValue([
        {
          userId: "user-1",
          timezone: "Europe/Paris",
          remindInChannel: false,
          remindByEmail: false,
          email: null,
        },
      ]),
    });

    await new ReminderService(repo, mailer).run(NOW);

    expect(repo.claim).not.toHaveBeenCalled();
    expect(repo.postInChannel).not.toHaveBeenCalled();
  });

  it("rend la réservation quand l'écriture échoue, pour retenter au passage suivant", async () => {
    const repo = makeRepository({
      findRemindable: jest.fn().mockResolvedValue([makeEvent()]),
      postInChannel: jest.fn().mockRejectedValue(new Error("base indisponible")),
    });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const run = await new ReminderService(repo, mailer).run(NOW);

    expect(run).toEqual({ sent: 0, failed: 1 });
    expect(repo.release).toHaveBeenCalledWith(
      "evt-1",
      "2026-11-12T18:00:00.000Z",
      "assistant_channel",
    );
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

    const run = await new ReminderService(repo, mailer).run(NOW);

    expect(run).toEqual({ sent: 1, failed: 1 });
  });
  describe("e-mail", () => {
    const withEmail = {
      userId: "user-1",
      timezone: "Europe/Paris",
      remindInChannel: true,
      remindByEmail: true,
      email: "yann@example.com",
    };

    it("envoie aussi un e-mail à qui l'a demandé, avec la même phrase que dans le canal", async () => {
      const repo = makeRepository({
        findRemindable: jest.fn().mockResolvedValue([makeEvent()]),
        findRecipients: jest.fn().mockResolvedValue([withEmail]),
      });

      const run = await new ReminderService(repo, mailer).run(NOW);

      expect(run).toEqual({ sent: 2, failed: 0 });
      expect(mailer).toHaveBeenCalledWith({
        to: "yann@example.com",
        message: "Rappel : Kiné, à 19h (dans 30 minutes).",
      });
    });

    it("n'envoie pas d'e-mail à qui l'a désactivé", async () => {
      const repo = makeRepository({
        findRemindable: jest.fn().mockResolvedValue([makeEvent()]),
        findRecipients: jest
          .fn()
          .mockResolvedValue([{ ...withEmail, remindByEmail: false, email: null }]),
      });

      await new ReminderService(repo, mailer).run(NOW);

      expect(mailer).not.toHaveBeenCalled();
    });

    it("réserve l'e-mail et le canal séparément", async () => {
      const claim = jest.fn().mockResolvedValue(true);
      const repo = makeRepository({
        findRemindable: jest.fn().mockResolvedValue([makeEvent()]),
        findRecipients: jest.fn().mockResolvedValue([withEmail]),
        claim,
      });

      await new ReminderService(repo, mailer).run(NOW);

      expect(claim).toHaveBeenCalledWith("evt-1", "2026-11-12T18:00:00.000Z", "assistant_channel");
      expect(claim).toHaveBeenCalledWith("evt-1", "2026-11-12T18:00:00.000Z", "email");
    });

    it("rend seulement la réservation de l'e-mail quand il échoue, et laisse le canal servi", async () => {
      const failing = jest.fn().mockRejectedValue(new Error("Resend indisponible"));
      const repo = makeRepository({
        findRemindable: jest.fn().mockResolvedValue([makeEvent()]),
        findRecipients: jest.fn().mockResolvedValue([withEmail]),
      });
      jest.spyOn(console, "warn").mockImplementation(() => undefined);

      const run = await new ReminderService(repo, failing).run(NOW);

      expect(run).toEqual({ sent: 1, failed: 1 });
      expect(repo.release).toHaveBeenCalledTimes(1);
      expect(repo.release).toHaveBeenCalledWith("evt-1", "2026-11-12T18:00:00.000Z", "email");
    });
  });
});
