import {
  AFTERNOON_FROM_CHOICES,
  DAY_PARTS,
  DEFAULT_DAY_PART_BOUNDS,
  EVENING_FROM_CHOICES,
  dayPartBoundsSchema,
  dayPartDefaultTime,
  dayPartOfHour,
} from "./day-part";

describe("moment de la journée", () => {
  it("place avant midi dans le matin, y compris minuit", () => {
    expect(dayPartOfHour(0)).toBe("morning");
    expect(dayPartOfHour(9)).toBe("morning");
    expect(dayPartOfHour(11)).toBe("morning");
  });

  it("fait commencer l'après-midi à midi pile par défaut", () => {
    expect(dayPartOfHour(12)).toBe("afternoon");
    expect(dayPartOfHour(18)).toBe("afternoon");
  });

  it("fait commencer le soir à 19h pile par défaut, jusqu'à la fin de la journée", () => {
    expect(dayPartOfHour(19)).toBe("evening");
    expect(dayPartOfHour(23)).toBe("evening");
  });

  it("suit les bornes choisies par l'utilisateur", () => {
    const lateRiser = { afternoonFrom: 14, eveningFrom: 21 };

    expect(dayPartOfHour(13, lateRiser)).toBe("morning");
    expect(dayPartOfHour(14, lateRiser)).toBe("afternoon");
    expect(dayPartOfHour(20, lateRiser)).toBe("afternoon");
    expect(dayPartOfHour(21, lateRiser)).toBe("evening");
  });

  it("propose 9h, 14h et 20h avec les bornes par défaut", () => {
    expect(DAY_PARTS.map((part) => dayPartDefaultTime(part))).toEqual(["09:00", "14:00", "20:00"]);
  });

  it("propose pour chaque moment une heure qui lui appartient, quelles que soient les bornes permises", () => {
    for (const afternoonFrom of AFTERNOON_FROM_CHOICES) {
      for (const eveningFrom of EVENING_FROM_CHOICES) {
        const bounds = { afternoonFrom, eveningFrom };
        for (const part of DAY_PARTS) {
          const [hours = ""] = dayPartDefaultTime(part, bounds).split(":");
          expect(dayPartOfHour(Number(hours), bounds)).toBe(part);
        }
      }
    }
  });

  it("accepte les bornes par défaut et refuse celles qui sortent des plages", () => {
    expect(dayPartBoundsSchema.safeParse(DEFAULT_DAY_PART_BOUNDS).success).toBe(true);
    expect(dayPartBoundsSchema.safeParse({ afternoonFrom: 9, eveningFrom: 19 }).success).toBe(
      false,
    );
    expect(dayPartBoundsSchema.safeParse({ afternoonFrom: 12, eveningFrom: 16 }).success).toBe(
      false,
    );
    expect(dayPartBoundsSchema.safeParse({ afternoonFrom: 12.5, eveningFrom: 19 }).success).toBe(
      false,
    );
  });

  it("garde l'après-midi avant le soir pour toute paire de valeurs permises", () => {
    for (const afternoonFrom of AFTERNOON_FROM_CHOICES) {
      for (const eveningFrom of EVENING_FROM_CHOICES) {
        expect(afternoonFrom).toBeLessThan(eveningFrom);
      }
    }
  });
});
