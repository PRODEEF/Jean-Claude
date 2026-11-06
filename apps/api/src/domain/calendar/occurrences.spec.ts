import type { CalendarEvent } from "@jc/domain";
import { logger } from "../../core/logger.js";
import { occurrencesInRange } from "./occurrences.js";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-1",
    title: "Cours",
    notes: null,
    startsAt: "2026-01-01T18:00:00.000Z", // un jeudi
    endsAt: "2026-01-01T19:00:00.000Z",
    allDay: false,
    rrule: null,
    reminderMinutesBefore: null,
    folderId: null,
    conversationId: null,
    createdByAssistant: false,
    createdAt: "2025-12-01T08:00:00.000Z",
    updatedAt: "2025-12-01T08:00:00.000Z",
    ...overrides,
  };
}

const MARCH = { from: "2026-03-01T00:00:00.000Z", to: "2026-04-01T00:00:00.000Z" };

describe("occurrencesInRange", () => {
  it("rend un événement ponctuel tel quel", () => {
    const event = makeEvent();
    expect(occurrencesInRange(event, MARCH)).toEqual([event]);
  });

  it("déplie une série hebdomadaire dans la fenêtre, en gardant la durée et l'identifiant", () => {
    const event = makeEvent({ rrule: "FREQ=WEEKLY;BYDAY=TH" });

    const found = occurrencesInRange(event, MARCH);

    expect(found.map((o) => o.startsAt)).toEqual([
      "2026-03-05T18:00:00.000Z",
      "2026-03-12T18:00:00.000Z",
      "2026-03-19T18:00:00.000Z",
      "2026-03-26T18:00:00.000Z",
    ]);
    expect(found[0]?.endsAt).toBe("2026-03-05T19:00:00.000Z");
    expect(found.every((o) => o.id === "evt-1")).toBe(true);
  });

  it("saute février quand la règle l'exclut", () => {
    const event = makeEvent({
      rrule: "FREQ=WEEKLY;BYDAY=TH;BYMONTH=1,3,4,5,6,7,8,9,10,11,12",
    });

    const february = occurrencesInRange(event, {
      from: "2026-02-01T00:00:00.000Z",
      to: "2026-03-01T00:00:00.000Z",
    });

    expect(february).toEqual([]);
  });

  it("n'avance pas avant le premier créneau de la série", () => {
    const event = makeEvent({ rrule: "FREQ=WEEKLY;BYDAY=TH" });

    expect(
      occurrencesInRange(event, {
        from: "2025-11-01T00:00:00.000Z",
        to: "2025-12-01T00:00:00.000Z",
      }),
    ).toEqual([]);
  });

  it("s'arrête à la date de fin de la série", () => {
    const event = makeEvent({ rrule: "FREQ=WEEKLY;BYDAY=TH;UNTIL=20260312T235959Z" });

    expect(occurrencesInRange(event, MARCH).map((o) => o.startsAt)).toEqual([
      "2026-03-05T18:00:00.000Z",
      "2026-03-12T18:00:00.000Z",
    ]);
  });

  it("garde visible une occurrence commencée avant la fenêtre qui s'y prolonge", () => {
    const event = makeEvent({
      startsAt: "2026-03-04T23:00:00.000Z",
      endsAt: "2026-03-05T02:00:00.000Z",
      rrule: "FREQ=DAILY",
    });

    const found = occurrencesInRange(event, {
      from: "2026-03-05T00:00:00.000Z",
      to: "2026-03-05T12:00:00.000Z",
    });

    expect(found.map((o) => o.startsAt)).toEqual(["2026-03-04T23:00:00.000Z"]);
  });

  it("garde l'événement tel quel quand la règle est illisible", () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    const event = makeEvent({ rrule: "FREQ=N'IMPORTE QUOI" });

    expect(occurrencesInRange(event, MARCH)).toEqual([event]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("borne le nombre d'occurrences d'une règle quotidienne", () => {
    const event = makeEvent({ rrule: "FREQ=DAILY" });

    const found = occurrencesInRange(event, {
      from: "2026-01-01T00:00:00.000Z",
      to: "2029-01-01T00:00:00.000Z",
    });

    expect(found.length).toBe(400);
  });
});
