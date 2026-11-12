import type { TaskList } from "@jc/domain";
import { listOccurrencesInRange, type OccurrenceOverride } from "./list-occurrences.js";

function makeList(overrides: Partial<TaskList> = {}): TaskList {
  return {
    id: "list-1",
    title: "Danse",
    kind: "todo",
    dueAt: "2026-01-01T18:00:00.000Z", // un jeudi
    dueAllDay: false,
    endsAt: "2026-01-01T19:00:00.000Z",
    rrule: null,
    reminderMinutesBefore: null,
    doneAt: null,
    notes: null,
    eventId: null,
    conversationId: null,
    folderId: null,
    createdByAssistant: false,
    createdAt: "2025-12-01T08:00:00.000Z",
    updatedAt: "2025-12-01T08:00:00.000Z",
    ...overrides,
  };
}

function makeOverride(overrides: Partial<OccurrenceOverride> = {}): OccurrenceOverride {
  return {
    occurrenceAt: "2026-03-05T18:00:00.000Z",
    doneAt: null,
    movedTo: null,
    cancelled: false,
    ...overrides,
  };
}

const MARCH = { from: "2026-03-01T00:00:00.000Z", to: "2026-04-01T00:00:00.000Z" };
const WEEKLY = "FREQ=WEEKLY;BYDAY=TH";

describe("listOccurrencesInRange", () => {
  describe("liste ponctuelle", () => {
    it("rend une seule occurrence, à l'échéance, quand elle tombe dans la fenêtre", () => {
      const list = makeList({
        dueAt: "2026-03-10T18:00:00.000Z",
        endsAt: "2026-03-10T19:00:00.000Z",
      });

      expect(listOccurrencesInRange(list, [], MARCH)).toEqual([
        {
          listId: "list-1",
          occurrenceAt: "2026-03-10T18:00:00.000Z",
          startsAt: "2026-03-10T18:00:00.000Z",
          endsAt: "2026-03-10T19:00:00.000Z",
          allDay: false,
          doneAt: null,
        },
      ]);
    });

    it("n'en rend aucune hors de la fenêtre", () => {
      expect(listOccurrencesInRange(makeList(), [], MARCH)).toEqual([]);
    });

    it("n'en rend aucune pour une liste sans échéance", () => {
      expect(listOccurrencesInRange(makeList({ dueAt: null, dueAllDay: null }), [], MARCH)).toEqual(
        [],
      );
    });

    it("reprend la date de complétion de la liste", () => {
      const list = makeList({
        dueAt: "2026-03-10T18:00:00.000Z",
        endsAt: null,
        doneAt: "2026-03-10T20:00:00.000Z",
      });

      expect(listOccurrencesInRange(list, [], MARCH)[0]?.doneAt).toBe("2026-03-10T20:00:00.000Z");
    });

    it("ignore les exceptions : sans série, il n'y a pas de date à part", () => {
      const list = makeList({ dueAt: "2026-03-10T18:00:00.000Z", endsAt: null });
      const override = makeOverride({ occurrenceAt: "2026-03-10T18:00:00.000Z", cancelled: true });

      expect(listOccurrencesInRange(list, [override], MARCH)).toHaveLength(1);
    });

    it("garde visible une occurrence commencée avant la fenêtre qui s'y prolonge", () => {
      const list = makeList({
        dueAt: "2026-02-28T23:00:00.000Z",
        endsAt: "2026-03-01T01:00:00.000Z",
      });

      expect(listOccurrencesInRange(list, [], MARCH)).toHaveLength(1);
    });
  });

  describe("série", () => {
    it("déplie la série sur la fenêtre, en gardant la durée", () => {
      const occurrences = listOccurrencesInRange(makeList({ rrule: WEEKLY }), [], MARCH);

      expect(occurrences.map((item) => item.startsAt)).toEqual([
        "2026-03-05T18:00:00.000Z",
        "2026-03-12T18:00:00.000Z",
        "2026-03-19T18:00:00.000Z",
        "2026-03-26T18:00:00.000Z",
      ]);
      expect(occurrences[0]?.endsAt).toBe("2026-03-05T19:00:00.000Z");
    });

    it("laisse sans fin une série qui n'en a pas", () => {
      const occurrences = listOccurrencesInRange(
        makeList({ rrule: WEEKLY, endsAt: null }),
        [],
        MARCH,
      );

      expect(occurrences.every((item) => item.endsAt === null)).toBe(true);
    });

    it("supprime la seule date annulée", () => {
      const occurrences = listOccurrencesInRange(
        makeList({ rrule: WEEKLY }),
        [makeOverride({ cancelled: true })],
        MARCH,
      );

      expect(occurrences.map((item) => item.startsAt)).not.toContain("2026-03-05T18:00:00.000Z");
      expect(occurrences).toHaveLength(3);
    });

    it("coche la seule date concernée", () => {
      const occurrences = listOccurrencesInRange(
        makeList({ rrule: WEEKLY }),
        [makeOverride({ doneAt: "2026-03-05T20:00:00.000Z" })],
        MARCH,
      );

      expect(occurrences.map((item) => item.doneAt)).toEqual([
        "2026-03-05T20:00:00.000Z",
        null,
        null,
        null,
      ]);
    });

    it("lit une date déplacée à sa nouvelle place, avec la même durée, sous sa clé d'origine", () => {
      const occurrences = listOccurrencesInRange(
        makeList({ rrule: WEEKLY }),
        [makeOverride({ movedTo: "2026-03-06T09:00:00.000Z" })],
        MARCH,
      );

      expect(occurrences[0]).toMatchObject({
        occurrenceAt: "2026-03-05T18:00:00.000Z",
        startsAt: "2026-03-06T09:00:00.000Z",
        endsAt: "2026-03-06T10:00:00.000Z",
      });
    });

    it("montre une date déplacée dans la fenêtre depuis une date qui lui est extérieure", () => {
      const override = makeOverride({
        occurrenceAt: "2026-04-02T18:00:00.000Z",
        movedTo: "2026-03-30T18:00:00.000Z",
      });

      const occurrences = listOccurrencesInRange(makeList({ rrule: WEEKLY }), [override], MARCH);

      expect(occurrences.map((item) => item.startsAt)).toContain("2026-03-30T18:00:00.000Z");
    });

    it("retire de la fenêtre une date déplacée hors d'elle", () => {
      const override = makeOverride({ movedTo: "2026-04-09T18:00:00.000Z" });

      const occurrences = listOccurrencesInRange(makeList({ rrule: WEEKLY }), [override], MARCH);

      expect(occurrences.map((item) => item.occurrenceAt)).not.toContain(
        "2026-03-05T18:00:00.000Z",
      );
    });

    it("garde la liste visible à son échéance quand la règle est illisible", () => {
      const list = makeList({ rrule: "NONSENSE", dueAt: "2026-03-10T18:00:00.000Z", endsAt: null });

      expect(listOccurrencesInRange(list, [], MARCH)).toHaveLength(1);
    });

    it("transmet l'intention « toute la journée »", () => {
      const list = makeList({
        rrule: WEEKLY,
        dueAt: "2026-01-01T00:00:00.000Z",
        dueAllDay: true,
        endsAt: null,
      });

      expect(listOccurrencesInRange(list, [], MARCH).every((item) => item.allDay)).toBe(true);
    });
  });
});
