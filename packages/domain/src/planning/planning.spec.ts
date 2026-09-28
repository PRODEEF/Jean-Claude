import type { CalendarEvent, Task, TaskListWithTasks } from "../index";
import {
  byDueDate,
  calendarDayOf,
  dateOfCalendarDay,
  datedLists,
  dueOnForDay,
  eventsOfDay,
  layoutDayEvents,
  layoutDayLists,
  listsOfDay,
  listsWithoutVisibleEvent,
  momentOf,
  momentsOfDay,
  openTaskCount,
  todoDays,
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
  });

  it("range la fin de soirée dans le soir, sans quatrième moment", () => {
    expect(momentOf({ dueAt: localIso(2026, 9, 12, 23), dueAllDay: false })).toBe("evening");
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
  it("rend matin, après-midi et soir même quand ils sont vides", () => {
    const groups = momentsOfDay(
      [makeList({ dueAt: localIso(2026, 9, 12, 9), dueAllDay: false })],
      DAY,
    );

    expect(groups.map((group) => group.moment.key)).toEqual(["morning", "afternoon", "evening"]);
    expect(groups[0]?.lists).toHaveLength(1);
    expect(groups[1]?.lists).toEqual([]);
  });

  it("n'annonce « Dans la journée » que s'il porte une liste", () => {
    const groups = momentsOfDay([makeList({ dueAt: localIso(2026, 9, 12), dueAllDay: true })], DAY);

    expect(groups.map((group) => group.moment.key)).toEqual([
      "anytime",
      "morning",
      "afternoon",
      "evening",
    ]);
    expect(groups[0]?.lists).toHaveLength(1);
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

  it("laisse vide la trame d'un jour sans échéance", () => {
    const groups = momentsOfDay([makeList({ dueAt: localIso(2026, 9, 13, 9) })], DAY);

    expect(groups).toHaveLength(3);
    expect(groups.every((group) => group.lists.length === 0)).toBe(true);
  });
});

describe("todoDays", () => {
  const september = Array.from({ length: 30 }, (_, index) => new Date(2026, 8, index + 1));

  it("ouvre le mois en cours sur aujourd'hui", () => {
    const days = todoDays(september, new Date(2026, 8, 28, 15, 30));

    expect(days.map((day) => day.getDate())).toEqual([28, 29, 30]);
  });

  it("déroule en entier un mois qui n'est pas le mois en cours", () => {
    expect(todoDays(september, new Date(2026, 9, 2))).toHaveLength(30);
    expect(todoDays(september, new Date(2026, 7, 31))).toHaveLength(30);
  });

  it("garde le dernier jour du mois quand c'est aujourd'hui", () => {
    expect(todoDays(september, new Date(2026, 8, 30, 23, 59))).toHaveLength(1);
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

describe("dueOnForDay", () => {
  it("date la tâche tapée un autre jour que celui de sa liste", () => {
    const list = makeList({ dueAt: localIso(2026, 9, 12), dueAllDay: true });

    expect(dueOnForDay(list, new Date(2026, 8, 14))).toBe("2026-09-14");
  });

  it("ne répète pas le jour que la liste porte déjà", () => {
    const list = makeList({ dueAt: localIso(2026, 9, 12, 9, 30), dueAllDay: false });

    expect(dueOnForDay(list, new Date(2026, 8, 12))).toBeNull();
  });

  it("date la tâche d'une liste sans échéance, visible par ses seules tâches", () => {
    expect(dueOnForDay(makeList(), new Date(2026, 8, 14))).toBe("2026-09-14");
  });
});

describe("datedLists", () => {
  it("ne garde que ce qui est daté", () => {
    expect(datedLists([makeList(), makeList({ dueAt: localIso(2026, 9, 12) })])).toHaveLength(1);
  });

  it("pose chaque tâche datée à son jour, même dans une liste sans échéance", () => {
    // Le cas remonté en usage réel : trois tâches, trois jours, une liste.
    const list = makeList({
      tasks: [
        { ...task("site"), dueOn: "2026-09-12" },
        { ...task("groupes"), dueOn: "2026-09-14" },
        { ...task("onboarding"), dueOn: "2026-09-20" },
      ],
    });

    const entries = datedLists([list]);

    expect(listsOfDay(entries, DAY).map((entry) => entry.tasks.map((t) => t.id))).toEqual([
      ["site"],
    ]);
    expect(listsOfDay(entries, new Date(2026, 8, 14))[0]?.tasks.map((t) => t.id)).toEqual([
      "groupes",
    ]);
    expect(listsOfDay(entries, new Date(2026, 8, 20))[0]?.tasks.map((t) => t.id)).toEqual([
      "onboarding",
    ]);
  });

  it("regroupe les tâches d'une même liste dues le même jour", () => {
    const list = makeList({
      tasks: [
        { ...task("a"), dueOn: "2026-09-12" },
        { ...task("b"), dueOn: "2026-09-12" },
      ],
    });

    expect(datedLists([list])).toHaveLength(1);
  });

  it("garde l'identité de la liste, sans créneau ni heure", () => {
    const list = makeList({ eventId: "evt-1", tasks: [{ ...task("a"), dueOn: "2026-09-12" }] });

    expect(datedLists([list])[0]).toMatchObject({
      id: "list-1",
      title: "Courses",
      dueAt: localIso(2026, 9, 12),
      dueAllDay: true,
      eventId: null,
    });
  });

  it("montre la liste à son échéance, et en plus aux jours de ses tâches datées", () => {
    const list = makeList({
      dueAt: localIso(2026, 9, 20),
      dueAllDay: true,
      tasks: [task("sans-date"), { ...task("a"), dueOn: "2026-09-12" }],
    });

    const entries = datedLists([list]);

    expect(entries).toHaveLength(2);
    expect(listsOfDay(entries, new Date(2026, 8, 20))[0]).toBe(list);
  });

  it("ne dédouble pas la liste pour une tâche due le jour même de son échéance", () => {
    const list = makeList({
      dueAt: localIso(2026, 9, 12, 18),
      dueAllDay: false,
      tasks: [{ ...task("a"), dueOn: "2026-09-12" }],
    });

    expect(datedLists([list])).toEqual([list]);
  });
});

describe("jours civils", () => {
  it("lit un jour civil à minuit dans l'horloge de l'appareil", () => {
    expect(dateOfCalendarDay("2026-09-12")).toEqual(new Date(2026, 8, 12));
  });

  it("rend le jour civil d'une date sans passer par UTC", () => {
    expect(calendarDayOf(new Date(2026, 8, 5, 23, 30))).toBe("2026-09-05");
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

/**
 * Ces cas supposent le fuseau Europe/Paris, fixé pour tout le paquet par
 * `jest.global-setup.js` : une journée UTC n'a jamais 23 ni 25 heures.
 */
describe("placement un jour de changement d'heure", () => {
  it("place sur la ligne de 10h un rendez-vous de 10h le jour du passage à l'heure d'hiver", () => {
    const [box] = layoutDayEvents(
      [makeEvent({ startsAt: localIso(2026, 10, 25, 10), endsAt: localIso(2026, 10, 25, 11) })],
      new Date(2026, 9, 25),
    );

    expect(box).toMatchObject({ startMinute: 600, endMinute: 660 });
  });

  it("place sur la ligne de 10h un rendez-vous de 10h le jour du passage à l'heure d'été", () => {
    const [box] = layoutDayEvents(
      [makeEvent({ startsAt: localIso(2026, 3, 29, 10), endsAt: localIso(2026, 3, 29, 11) })],
      new Date(2026, 2, 29),
    );

    expect(box).toMatchObject({ startMinute: 600, endMinute: 660 });
  });

  it("garde dans la grille un rendez-vous de fin de soirée le jour de 25 heures", () => {
    const [box] = layoutDayEvents(
      [
        makeEvent({
          startsAt: localIso(2026, 10, 25, 23),
          endsAt: localIso(2026, 10, 25, 23, 45),
        }),
      ],
      new Date(2026, 9, 25),
    );

    expect(box).toMatchObject({ startMinute: 1380, endMinute: 1425 });
  });

  it("place une todoliste à heure précise sur la ligne de son heure", () => {
    const { timed } = layoutDayLists(
      [makeList({ dueAt: localIso(2026, 10, 25, 14), dueAllDay: false })],
      new Date(2026, 9, 25),
    );

    expect(timed[0]).toMatchObject({ startMinute: 840, endMinute: 900 });
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

function task(id: string): Task {
  return {
    id,
    listId: "list-1",
    title: id,
    notes: null,
    done: false,
    completedAt: null,
    parentId: null,
    dueOn: null,
    position: 0,
    createdAt: localIso(2026, 9, 1),
    updatedAt: localIso(2026, 9, 1),
  };
}
