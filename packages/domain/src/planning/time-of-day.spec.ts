import {
  formatTimeOfDay,
  roundTimeToStep,
  TIME_PICKER_MINUTE_STEP,
  wrapIndex,
} from "./time-of-day";

describe("wrapIndex", () => {
  it("boucle de 23 h à 00 h et de 00 h à 23 h", () => {
    expect(wrapIndex(24, 24)).toBe(0);
    expect(wrapIndex(25, 24)).toBe(1);
    expect(wrapIndex(-1, 24)).toBe(23);
    expect(wrapIndex(-25, 24)).toBe(23);
  });

  it("boucle les minutes de 55 à 00 au pas de 5 (douze positions)", () => {
    expect(wrapIndex(12, 12)).toBe(0);
    expect(wrapIndex(-1, 12)).toBe(11);
  });
});

describe("roundTimeToStep", () => {
  it("garde une heure déjà au pas", () => {
    expect(roundTimeToStep("14:30")).toEqual({ hour: 14, minute: 30 });
    expect(roundTimeToStep("09:00")).toEqual({ hour: 9, minute: 0 });
  });

  it("arrondit à la minute de 5 la plus proche", () => {
    expect(roundTimeToStep("14:07")).toEqual({ hour: 14, minute: 5 });
    expect(roundTimeToStep("14:08")).toEqual({ hour: 14, minute: 10 });
  });

  it("passe à l'heure suivante quand l'arrondi atteint 60", () => {
    expect(roundTimeToStep("14:58")).toEqual({ hour: 15, minute: 0 });
  });

  it("boucle après minuit", () => {
    expect(roundTimeToStep("23:58")).toEqual({ hour: 0, minute: 0 });
  });

  it("accepte une heure sans zéro devant", () => {
    expect(roundTimeToStep("9:05")).toEqual({ hour: 9, minute: 5 });
  });

  it("refuse ce qui n'est pas une heure", () => {
    expect(roundTimeToStep("")).toBeNull();
    expect(roundTimeToStep("25:00")).toBeNull();
    expect(roundTimeToStep("14:75")).toBeNull();
    expect(roundTimeToStep("n'importe quoi")).toBeNull();
  });

  it("suit un autre pas quand on le donne", () => {
    expect(roundTimeToStep("14:07", 15)).toEqual({ hour: 14, minute: 0 });
    expect(roundTimeToStep("14:08", 15)).toEqual({ hour: 14, minute: 15 });
  });

  it("a un pas par défaut de 5 minutes", () => {
    expect(TIME_PICKER_MINUTE_STEP).toBe(5);
  });
});

describe("formatTimeOfDay", () => {
  it("écrit toujours deux chiffres", () => {
    expect(formatTimeOfDay({ hour: 9, minute: 5 })).toBe("09:05");
    expect(formatTimeOfDay({ hour: 0, minute: 0 })).toBe("00:00");
    expect(formatTimeOfDay({ hour: 23, minute: 55 })).toBe("23:55");
  });
});
