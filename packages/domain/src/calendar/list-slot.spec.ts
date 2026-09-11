import { slotForList } from "./list-slot";

describe("slotForList", () => {
  it("bloque une heure pour une échéance qui vise un créneau", () => {
    const slot = slotForList({
      title: "Courses",
      dueAt: "2026-09-12T08:00:00.000Z",
      dueAllDay: false,
    });

    expect(slot).toEqual({
      title: "Courses",
      startsAt: "2026-09-12T08:00:00.000Z",
      endsAt: "2026-09-12T09:00:00.000Z",
      allDay: false,
    });
  });

  it("tient la journée, sans fin, pour une échéance sans créneau", () => {
    const slot = slotForList({
      title: "Courses",
      dueAt: "2026-09-11T22:00:00.000Z",
      dueAllDay: true,
    });

    expect(slot).toMatchObject({ allDay: true, endsAt: null });
  });

  it("reprend le titre de la liste, qui est la source", () => {
    const slot = slotForList({
      title: "Courses du week-end",
      dueAt: "2026-09-12T08:00:00.000Z",
      dueAllDay: false,
    });

    expect(slot?.title).toBe("Courses du week-end");
  });

  it("ne bloque rien pour une liste sans échéance", () => {
    expect(slotForList({ title: "Jardin", dueAt: null, dueAllDay: null })).toBeNull();
  });

  it("tient la journée quand le moment n'a pas été enregistré", () => {
    // Listes écrites avant que l'intention ne soit conservée : « dans la
    // journée » est le cas courant, et le repli le moins surprenant.
    const slot = slotForList({
      title: "Courses",
      dueAt: "2026-09-12T08:00:00.000Z",
      dueAllDay: null,
    });

    expect(slot).toMatchObject({ allDay: true, endsAt: null });
  });
});
