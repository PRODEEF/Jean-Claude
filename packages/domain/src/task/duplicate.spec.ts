import type { Task, TaskListWithTasks } from "./task.schema";
import { duplicateOfList } from "./duplicate";

const today = new Date(2026, 10, 24, 10);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function task(n: number, over: Partial<Task> = {}): Task {
  return {
    id: id(n),
    listId: id(100),
    title: `Tâche ${n}`,
    notes: null,
    done: false,
    completedAt: null,
    parentId: null,
    dueOn: null,
    position: n,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...over,
  };
}

function list(over: Partial<TaskListWithTasks> = {}): TaskListWithTasks {
  return {
    id: id(100),
    title: "Courses",
    kind: "shopping",
    folderId: id(7),
    dueAt: new Date(2026, 10, 25, 15).toISOString(),
    dueAllDay: false,
    endsAt: new Date(2026, 10, 25, 16).toISOString(),
    rrule: null,
    reminderMinutesBefore: 30,
    doneAt: null,
    notes: "Marché",
    eventId: null,
    sourceEventId: null,
    conversationId: null,
    createdByAssistant: false,
    location: "Halles",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    tasks: [],
    ...over,
  } as TaskListWithTasks;
}

describe("duplicateOfList", () => {
  it("pose la copie au même endroit : jour, heure, dossier, rappel, notes et lieu", () => {
    const copy = duplicateOfList(list(), today).list;

    expect(copy).toMatchObject({
      title: "Courses",
      kind: "shopping",
      folderId: id(7),
      dueAt: list().dueAt,
      dueAllDay: false,
      endsAt: list().endsAt,
      reminderMinutesBefore: 30,
      notes: "Marché",
      location: "Halles",
    });
  });

  it("ne reprend pas la répétition : la copie est une liste ponctuelle", () => {
    const copy = duplicateOfList(list({ rrule: "FREQ=WEEKLY" }), today).list;

    expect(copy.rrule).toBeUndefined();
  });

  it("recopie les lignes dans l'ordre, sans ce qui était coché", () => {
    const items = duplicateOfList(
      list({
        tasks: [
          task(2, { done: true, completedAt: "2026-11-02T00:00:00.000Z" }),
          task(1),
          task(3, { parentId: id(1) }),
        ],
      }),
      today,
    ).items;

    expect(items).toEqual([
      { title: "Tâche 1", depth: 0 },
      { title: "Tâche 2", depth: 0 },
      { title: "Tâche 3", depth: 1 },
    ]);
  });

  it("garde le jour d'une ligne à venir et abandonne celui d'une ligne révolue", () => {
    const items = duplicateOfList(
      list({ tasks: [task(1, { dueOn: "2026-11-30" }), task(2, { dueOn: "2026-11-02" })] }),
      today,
    ).items;

    expect(items).toEqual([
      { title: "Tâche 1", depth: 0, dueOn: "2026-11-30" },
      { title: "Tâche 2", depth: 0 },
    ]);
  });

  it("copie une liste sans date sans lui en inventer une", () => {
    const copy = duplicateOfList(list({ dueAt: null, dueAllDay: null, endsAt: null }), today).list;

    expect(copy.dueAt).toBeNull();
    expect(copy).not.toHaveProperty("dueAllDay");
  });

  it("copie une liste vide", () => {
    expect(duplicateOfList(list(), today).items).toEqual([]);
  });
});
