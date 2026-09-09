import { isPastCalendarDay } from "./timezone.js";

describe("isPastCalendarDay", () => {
  const timezone = "Europe/Paris";
  const now = new Date("2026-09-09T12:00:00.000Z");

  it("refuse un jour civil déjà révolu", () => {
    expect(isPastCalendarDay("2026-09-08T10:00:00.000Z", timezone, now)).toBe(true);
  });

  it("accepte aujourd'hui, même à une heure déjà passée", () => {
    expect(isPastCalendarDay("2026-09-09T07:00:00.000Z", timezone, now)).toBe(false);
  });

  it("accepte un jour à venir", () => {
    expect(isPastCalendarDay("2026-09-12T00:00:00.000Z", timezone, now)).toBe(false);
  });
});
