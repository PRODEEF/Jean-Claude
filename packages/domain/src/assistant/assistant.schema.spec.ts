import {
  createEventsPayloadSchema,
  createRecurringEventPayloadSchema,
  createTaskListsPayloadSchema,
} from "./assistant.schema";

const LONG =
  "THUNDERBIRD : Paramétrages des dossiers entre ROUNDCUBE / THUNDERBIRD et OUTLOOK, demander à Claude pourquoi l'existence de ce dossier n'émane pas d'OUTLOOK";

describe("titres venus du modèle", () => {
  it("raccourcit une sous-tâche trop longue au lieu de rejeter la proposition", () => {
    const parsed = createTaskListsPayloadSchema.safeParse({
      lists: [
        {
          title: "PRO MAIL - DEAD LINE MICROSOFT DEC 2026",
          kind: "todo",
          items: [{ title: "Court" }, { title: LONG }],
        },
      ],
    });

    expect(parsed.success).toBe(true);
    const items = parsed.success ? (parsed.data.lists[0]?.items ?? []) : [];
    expect(items[0]?.title).toBe("Court");
    expect(items[1]?.title.length).toBeLessThanOrEqual(120);
    expect(items[1]?.title.endsWith("…")).toBe(true);
  });

  it("coupe à un mot quand c'est possible", () => {
    const parsed = createTaskListsPayloadSchema.safeParse({
      lists: [{ title: "Liste", kind: "todo", items: [{ title: LONG }] }],
    });

    const title = parsed.success ? (parsed.data.lists[0]?.items[0]?.title ?? "") : "";
    expect(LONG.startsWith(title.slice(0, -1))).toBe(true);
    expect(title.slice(0, -1).endsWith(" ")).toBe(false);
    expect(LONG[title.length - 1] === " " || title.length > 60).toBe(true);
  });

  it("laisse un titre de moins de 120 caractères tel quel", () => {
    const parsed = createEventsPayloadSchema.safeParse({
      events: [{ title: "Dentiste", startsAt: "2026-11-27T14:00:00.000Z" }],
    });

    expect(parsed.success && parsed.data.events[0]?.title).toBe("Dentiste");
  });

  it("raccourcit aussi les sous-tâches d'une série", () => {
    const parsed = createRecurringEventPayloadSchema.safeParse({
      title: "PRODEEF",
      startsAt: "2026-11-27T12:00:00.000Z",
      rrule: "FREQ=DAILY",
      items: [LONG],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejette toujours un titre vide", () => {
    const parsed = createEventsPayloadSchema.safeParse({
      events: [{ title: "   ", startsAt: "2026-11-27T14:00:00.000Z" }],
    });

    expect(parsed.success).toBe(false);
  });
});
