import { dueReminders, type ReminderEvent } from "./reminder-schedule.js";

const WINDOW = 15 * 60_000;

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

describe("dueReminders", () => {
  it("rend le rappel d'un rendez-vous dont l'heure de rappel vient de passer", () => {
    // Rendez-vous à 18h, rappel 30 min avant : 17h30. Il est 17h35.
    const due = dueReminders([makeEvent()], new Date("2026-11-12T17:35:00.000Z"), WINDOW);

    expect(due.map((item) => item.occurrenceAt)).toEqual(["2026-11-12T18:00:00.000Z"]);
  });

  it("ne rend rien avant l'heure du rappel", () => {
    const due = dueReminders([makeEvent()], new Date("2026-11-12T17:20:00.000Z"), WINDOW);

    expect(due).toEqual([]);
  });

  it("ne rend plus un rappel dont l'heure est sortie de la fenêtre", () => {
    // Rappel à 17h30, il est 17h50 : la fenêtre de 15 minutes est passée.
    const due = dueReminders([makeEvent()], new Date("2026-11-12T17:50:00.000Z"), WINDOW);

    expect(due).toEqual([]);
  });

  it("rend un rappel à 0 minute au début du rendez-vous", () => {
    const due = dueReminders(
      [makeEvent({ reminderMinutesBefore: 0 })],
      new Date("2026-11-12T18:02:00.000Z"),
      WINDOW,
    );

    expect(due).toHaveLength(1);
  });

  it("ignore un rendez-vous sans rappel", () => {
    const due = dueReminders(
      [makeEvent({ reminderMinutesBefore: null })],
      new Date("2026-11-12T17:35:00.000Z"),
      WINDOW,
    );

    expect(due).toEqual([]);
  });

  it("rend le rappel de la bonne occurrence d'une série", () => {
    // Série tous les jeudis à 18h, rappel 30 min avant. Jeudi 12, il est 17h40.
    const series = makeEvent({
      startsAt: "2026-11-05T18:00:00.000Z",
      endsAt: "2026-11-05T19:00:00.000Z",
      rrule: "FREQ=WEEKLY;BYDAY=TH",
    });

    const due = dueReminders([series], new Date("2026-11-12T17:40:00.000Z"), WINDOW);

    expect(due.map((item) => item.occurrenceAt)).toEqual(["2026-11-12T18:00:00.000Z"]);
  });

  it("ne rappelle pas une série un jour où elle n'a pas lieu", () => {
    const series = makeEvent({
      startsAt: "2026-11-05T18:00:00.000Z",
      rrule: "FREQ=WEEKLY;BYDAY=TH",
    });

    // Vendredi 13, même heure.
    expect(dueReminders([series], new Date("2026-11-13T17:40:00.000Z"), WINDOW)).toEqual([]);
  });

  it("ne rappelle pas une occurrence déjà commencée dont le rappel est parti", () => {
    // Rendez-vous de 17h à 19h ; à 18h il est en cours, son rappel de 16h30 est loin.
    const long = makeEvent({
      startsAt: "2026-11-12T17:00:00.000Z",
      endsAt: "2026-11-12T19:00:00.000Z",
    });

    expect(dueReminders([long], new Date("2026-11-12T18:00:00.000Z"), WINDOW)).toEqual([]);
  });
});
