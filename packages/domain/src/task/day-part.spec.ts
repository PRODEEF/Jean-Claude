import { DAY_PART_DEFAULT_TIME, DAY_PARTS, dayPartOfHour } from "./day-part";

describe("moment de la journée", () => {
  it("place avant midi dans le matin, y compris minuit", () => {
    expect(dayPartOfHour(0)).toBe("morning");
    expect(dayPartOfHour(9)).toBe("morning");
    expect(dayPartOfHour(11)).toBe("morning");
  });

  it("fait commencer l'après-midi à midi pile", () => {
    expect(dayPartOfHour(12)).toBe("afternoon");
    expect(dayPartOfHour(18)).toBe("afternoon");
  });

  it("fait commencer le soir à 19h pile, jusqu'à la fin de la journée", () => {
    expect(dayPartOfHour(19)).toBe("evening");
    expect(dayPartOfHour(23)).toBe("evening");
  });

  it("propose pour chaque moment une heure qui lui appartient", () => {
    for (const part of DAY_PARTS) {
      const [hours = ""] = DAY_PART_DEFAULT_TIME[part].split(":");
      expect(dayPartOfHour(Number(hours))).toBe(part);
    }
  });
});
