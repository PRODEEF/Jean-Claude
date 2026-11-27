import { describeRrule, presetOfRrule, rruleForPreset } from "./recurrence";

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

describe("describeRrule", () => {
  it("dit « du lundi au vendredi » pour les jours ouvrés, dans n'importe quel ordre", () => {
    expect(describeRrule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")).toBe("du lundi au vendredi");
    expect(describeRrule("FREQ=WEEKLY;BYDAY=FR,MO,WE,TU,TH")).toBe("du lundi au vendredi");
  });

  it("dit un jour seul, plusieurs jours et le week-end", () => {
    expect(describeRrule("FREQ=WEEKLY;BYDAY=TU")).toBe("tous les mardis");
    expect(describeRrule("FREQ=WEEKLY;BYDAY=MO,WE")).toBe("chaque lundi, mercredi");
    expect(describeRrule("FREQ=WEEKLY;BYDAY=SA,SU")).toBe("le week-end");
  });

  it("dit les fréquences simples", () => {
    expect(describeRrule("FREQ=DAILY")).toBe("tous les jours");
    expect(describeRrule("FREQ=MONTHLY")).toBe("tous les mois");
    expect(describeRrule("FREQ=YEARLY")).toBe("tous les ans");
    expect(describeRrule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU")).toBe("tous les jours");
  });

  it("ne dit rien d'une règle qu'une phrase simple trahirait", () => {
    expect(describeRrule("FREQ=WEEKLY;BYDAY=TH;BYMONTH=1,3")).toBeUndefined();
    expect(describeRrule("FREQ=DAILY;COUNT=10")).toBeUndefined();
    expect(describeRrule("n'importe quoi")).toBeUndefined();
  });
});
