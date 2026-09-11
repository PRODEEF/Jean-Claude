import type { CalendarEvent, TaskListWithTasks } from "../index";
import {
  byDueDate,
  datedLists,
  eventsOfDay,
  layoutDayEvents,
  layoutDayLists,
  listsOfDay,
  listsWithoutVisibleEvent,
  momentOf,
  momentsOfDay,
  openTaskCount,
} from "./planning";

/**
 * Les dates sont construites en heure locale puis converties : ces règles
 * lisent l'horloge de l'appareil, et une constante ISO en dur ferait dépendre
 * le résultat du fuseau de la machine qui joue les tests.
 */
function localIso(year: number, month: number, day: number, hours = 0, minutes = 0): string {
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

function makeList(overrides: Partial<TaskListWithTasks> = {}): TaskListWithTasks {
  return {
    id: "list-1",
    title: "Courses",
    kind: "shopping",
    dueAt: null,
    dueAllDay: null,
    eventId: null,
    conversationId: null,
    folderId: null,
    createdByAssistant: false,
    createdAt: localIso(2026, 9, 1),
    updatedAt: localIso(2026, 9, 1),
    tasks: [],
    ...overrides,
  };
}

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-1",
    title: "Kiné",
    notes: null,
    startsAt: localIso(2026, 9, 12, 10),
    endsAt: localIso(2026, 9, 12, 11),
    allDay: false,
    rrule: null,
    reminderMinutesBefore: null,
    folderId: null,
    conversationId: null,
    createdByAssistant: false,
    createdAt: localIso(2026, 9, 1),
    updatedAt: localIso(2026, 9, 1),
    ...overrides,
  };
}

const DAY = new Date(2026, 8, 12);

describe("momentOf", () => {
  it("range dans la journée une échéance qui ne vise pas de créneau", () => {
    expect(momentOf({ dueAt: localIso(2026, 9, 12, 9), dueAllDay: true })).toBe("anytime");
  });

  it("déduit le moment de l'heure quand l'échéance vise un créneau", () => {
    expect(momentOf({ dueAt: localIso(2026, 9, 12, 9), dueAllDay: false })).toBe("morning");
    expect(momentOf({ dueAt: localIso(2026, 9, 12, 14), dueAllDay: false })).toBe("afternoon");
    expect(momentOf({ dueAt: localIso(2026, 9, 12, 19), dueAllDay: false })).toBe("evening");
    expect(momentOf({ dueAt: localIso(2026, 9, 12, 23), dueAllDay: false })).toBe("night");
  });

  it("annonce dans la journée une échéance à minuit, jamais le matin", () => {
    // C'est l'heure que porte une liste datée sans créneau : l'annoncer à 0h
    // laisserait croire à un rendez-vous nocturne.
    expect(momentOf({ dueAt: localIso(2026, 9, 12, 0), dueAllDay: true })).toBe("anytime");
  });

  it("ne dit rien du moment d'une liste sans échéance", () => {
    expect(momentOf({ dueAt: null, dueAllDay: null })).toBe("anytime");
  });

  it("retombe sur la journée quand le moment n'a pas été enregistré", () => {
    expect(momentOf({ dueAt: localIso(2026, 9, 12, 9), dueAllDay: null })).toBe("anytime");
  });
});

describe("momentsOfDay", () => {
  it("écarte les moments vides plutôt que d'annoncer cinq fois rien", () => {
    const groups = momentsOfDay(
      [makeList({ dueAt: localIso(2026, 9, 12, 9), dueAllDay: false })],
      DAY,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.moment.key).toBe("morning");
  });

  it("ordonne les listes d'un même moment de la plus tôt à la plus tard", () => {
    const groups = momentsOfDay(
      [
        makeList({ id: "b", title: "Tard", dueAt: localIso(2026, 9, 12, 11), dueAllDay: false }),
        makeList({ id: "a", title: "Tôt", dueAt: localIso(2026, 9, 12, 8), dueAllDay: false }),
      ],
      DAY,
    );

    expect(groups[0]?.lists.map((list) => list.title)).toEqual(["Tôt", "Tard"]);
  });

  it("ne retient rien d'un jour sans échéance", () => {
    expect(momentsOfDay([makeList({ dueAt: localIso(2026, 9, 13, 9) })], DAY)).toEqual([]);
  });
});

describe("listsOfDay", () => {
  it("retient la liste échue ce jour-là, pas celle de la veille ni du lendemain", () => {
    const lists = [
      makeList({ id: "veille", dueAt: localIso(2026, 9, 11, 23, 59) }),
      makeList({ id: "jour", dueAt: localIso(2026, 9, 12, 0) }),
      makeList({ id: "fin", dueAt: localIso(2026, 9, 12, 23, 59) }),
      makeList({ id: "lendemain", dueAt: localIso(2026, 9, 13, 0) }),
    ];

    expect(listsOfDay(lists, DAY).map((list) => list.id)).toEqual(["jour", "fin"]);
  });

  it("ignore les listes sans échéance", () => {
    expect(listsOfDay([makeList()], DAY)).toEqual([]);
  });
});

describe("listsWithoutVisibleEvent", () => {
  it("ne redessine pas une liste que son rendez-vous représente déjà", () => {
    const lists = [makeList({ dueAt: localIso(2026, 9, 12), eventId: "evt-1" })];

    expect(listsWithoutVisibleEvent(lists, new Set(["evt-1"]))).toEqual([]);
  });

  it("montre la liste quand son rendez-vous n'est pas dans la fenêtre chargée", () => {
    // Sans ce repli elle disparaîtrait des deux lectures à la fois.
    const lists = [makeList({ dueAt: localIso(2026, 9, 12), eventId: "evt-9" })];

    expect(listsWithoutVisibleEvent(lists, new Set(["evt-1"]))).toHaveLength(1);
  });

  it("écarte les listes sans échéance, qui ne tombent aucun jour", () => {
    expect(listsWithoutVisibleEvent([makeList()], new Set())).toEqual([]);
  });
});

describe("openTaskCount", () => {
  it("ne compte que ce qui reste à faire", () => {
    const list = makeList({
      tasks: [
        { ...task("a"), done: true },
        task("b"),
        task("c"),
      ],
    });

    expect(openTaskCount(list)).toBe(2);
  });

  it("rend zéro sur une liste vide", () => {
    expect(openTaskCount(makeList())).toBe(0);
  });
});

describe("byDueDate", () => {
  it("place la plus tôt en premier", () => {
    const tot = makeList({ dueAt: localIso(2026, 9, 12, 8) });
    const tard = makeList({ dueAt: localIso(2026, 9, 12, 18) });

    expect([tard, tot].sort(byDueDate)[0]).toBe(tot);
  });
});

describe("datedLists", () => {
  it("ne garde que ce qui est daté", () => {
    expect(datedLists([makeList(), makeList({ dueAt: localIso(2026, 9, 12) })])).toHaveLength(1);
  });
});

describe("eventsOfDay", () => {
  it("garde un rendez-vous commencé la veille et qui occupe encore la journée", () => {
    const event = makeEvent({
      startsAt: localIso(2026, 9, 11, 22),
      endsAt: localIso(2026, 9, 12, 2),
    });

    expect(eventsOfDay([event], DAY)).toHaveLength(1);
  });

  it("ne fait pas déborder sur le lendemain un rappel sans heure de fin", () => {
    const event = makeEvent({ startsAt: localIso(2026, 9, 12, 9), endsAt: null });

    expect(eventsOfDay([event], DAY)).toHaveLength(1);
    expect(eventsOfDay([event], new Date(2026, 8, 13))).toHaveLength(0);
  });
});

describe("layoutDayEvents", () => {
  it("laisse toute la largeur à un rendez-vous seul", () => {
    const [box] = layoutDayEvents([makeEvent()], DAY);

    expect(box).toMatchObject({ startMinute: 600, endMinute: 660, lane: 0, laneCount: 1 });
  });

  it("partage la largeur entre deux rendez-vous qui se chevauchent", () => {
    const boxes = layoutDayEvents(
      [
        makeEvent({ id: "a", startsAt: localIso(2026, 9, 12, 10), endsAt: localIso(2026, 9, 12, 11) }),
        makeEvent({ id: "b", startsAt: localIso(2026, 9, 12, 10, 30), endsAt: localIso(2026, 9, 12, 12) }),
      ],
      DAY,
    );

    expect(boxes.map((box) => box.lane)).toEqual([0, 1]);
    expect(boxes.every((box) => box.laneCount === 2)).toBe(true);
  });

  it("ne rétrécit pas toute la journée pour un chevauchement du matin", () => {
    const boxes = layoutDayEvents(
      [
        makeEvent({ id: "a", startsAt: localIso(2026, 9, 12, 9), endsAt: localIso(2026, 9, 12, 10) }),
        makeEvent({ id: "b", startsAt: localIso(2026, 9, 12, 9, 30), endsAt: localIso(2026, 9, 12, 10) }),
        makeEvent({ id: "c", startsAt: localIso(2026, 9, 12, 16), endsAt: localIso(2026, 9, 12, 17) }),
      ],
      DAY,
    );

    expect(boxes.find((box) => box.event.id === "c")?.laneCount).toBe(1);
  });

  it("sort la journée entière de la grille horaire", () => {
    expect(layoutDayEvents([makeEvent({ allDay: true, endsAt: null })], DAY)).toEqual([]);
  });

  it("ne rend jamais une fin antérieure au début", () => {
    // Fin avant le début — donnée incohérente, ou rendez-vous à cheval sur la
    // veille : sans borne, la hauteur devenait négative et les colonnes se
    // calculaient sur un intervalle à l'envers.
    const event = makeEvent({
      startsAt: localIso(2026, 9, 12, 15),
      endsAt: localIso(2026, 9, 12, 11),
    });

    const [box] = layoutDayEvents([event], DAY);
    expect(box?.endMinute).toBeGreaterThanOrEqual(box?.startMinute ?? 0);
  });
});

describe("layoutDayLists", () => {
  it("place dans la grille la liste qui vise un créneau", () => {
    const { timed, untimed } = layoutDayLists(
      [makeList({ dueAt: localIso(2026, 9, 12, 10), dueAllDay: false })],
      DAY,
    );

    expect(untimed).toEqual([]);
    expect(timed[0]).toMatchObject({ startMinute: 600, endMinute: 660 });
  });

  it("laisse au bandeau la liste qui vise la journée", () => {
    const { timed, untimed } = layoutDayLists(
      [makeList({ dueAt: localIso(2026, 9, 12), dueAllDay: true })],
      DAY,
    );

    expect(timed).toEqual([]);
    expect(untimed).toHaveLength(1);
  });
});

function task(id: string) {
  return {
    id,
    listId: "list-1",
    title: id,
    notes: null,
    done: false,
    completedAt: null,
    parentId: null,
    position: 0,
    createdAt: localIso(2026, 9, 1),
    updatedAt: localIso(2026, 9, 1),
  };
}
