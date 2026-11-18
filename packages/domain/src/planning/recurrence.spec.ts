import { presetOfRrule, rruleForPreset } from "./recurrence";

// Un jeudi : le 19 novembre 2026.
const THURSDAY = new Date(2026, 10, 19, 18, 0, 0);

describe("rruleForPreset", () => {
  it("rend aucune règle pour « une seule fois »", () => {
    expect(rruleForPreset("none", THURSDAY)).toBeNull();
  });

  it("écrit une règle par fréquence", () => {
    expect(rruleForPreset("daily", THURSDAY)).toBe("FREQ=DAILY");
    expect(rruleForPreset("monthly", THURSDAY)).toBe("FREQ=MONTHLY");
    expect(rruleForPreset("yearly", THURSDAY)).toBe("FREQ=YEARLY");
  });

  it("fixe la répétition hebdomadaire sur le jour du début", () => {
    expect(rruleForPreset("weekly", THURSDAY)).toBe("FREQ=WEEKLY;BYDAY=TH");
    expect(rruleForPreset("weekly", new Date(2026, 10, 22))).toBe("FREQ=WEEKLY;BYDAY=SU");
  });
});

describe("presetOfRrule", () => {
  it("reconnaît l'absence de règle", () => {
    expect(presetOfRrule(null, THURSDAY)).toBe("none");
    expect(presetOfRrule("  ", THURSDAY)).toBe("none");
  });

  it("reconnaît les quatre choix, avec ou sans préfixe RRULE:", () => {
    expect(presetOfRrule("FREQ=DAILY", THURSDAY)).toBe("daily");
    expect(presetOfRrule("RRULE:FREQ=MONTHLY", THURSDAY)).toBe("monthly");
    expect(presetOfRrule("freq=yearly", THURSDAY)).toBe("yearly");
    expect(presetOfRrule("FREQ=WEEKLY", THURSDAY)).toBe("weekly");
  });

  it("relit ce que rruleForPreset écrit", () => {
    for (const preset of ["none", "daily", "weekly", "monthly", "yearly"] as const) {
      expect(presetOfRrule(rruleForPreset(preset, THURSDAY), THURSDAY)).toBe(preset);
    }
  });

  it("garde « personnalisée » une règle de l'assistant, pour ne pas la défaire", () => {
    // « un cours tous les jeudis, sauf en février » — l'exemple de la TODOLIST.
    expect(presetOfRrule("FREQ=WEEKLY;BYDAY=TH;BYMONTH=1,3,4,5,6,7,8,9,10,11,12", THURSDAY)).toBe(
      "custom",
    );
    expect(presetOfRrule("FREQ=WEEKLY;BYDAY=TH;COUNT=10", THURSDAY)).toBe("custom");
    expect(presetOfRrule("FREQ=DAILY;UNTIL=20261231T000000Z", THURSDAY)).toBe("custom");
  });

  it("garde « personnalisée » une règle hebdomadaire qui vise un autre jour que le début", () => {
    expect(presetOfRrule("FREQ=WEEKLY;BYDAY=MO", THURSDAY)).toBe("custom");
    expect(presetOfRrule("FREQ=WEEKLY;BYDAY=MO,TH", THURSDAY)).toBe("custom");
  });

  it("garde « personnalisée » une règle illisible plutôt que de la remplacer", () => {
    expect(presetOfRrule("n'importe quoi", THURSDAY)).toBe("custom");
    expect(presetOfRrule("INTERVAL=2", THURSDAY)).toBe("custom");
  });
});
