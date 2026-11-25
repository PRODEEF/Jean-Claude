import {
  briefMessage,
  dayBounds,
  describeAgenda,
  fixedGreeting,
  isBriefTime,
  localDay,
  type BriefItem,
} from "./morning-brief.js";

const PARIS = "Europe/Paris";

describe("isBriefTime", () => {
  it("part à partir de 8 h dans le fuseau de l'utilisateur", () => {
    // 07:30 UTC = 08:30 à Paris en novembre.
    expect(isBriefTime(new Date("2026-11-25T07:30:00.000Z"), PARIS)).toBe(true);
  });

  it("attend 8 h : pas de point à 7 h 59", () => {
    expect(isBriefTime(new Date("2026-11-25T06:59:00.000Z"), PARIS)).toBe(false);
  });

  it("rattrape un passage manqué jusqu'à midi, pas au-delà", () => {
    expect(isBriefTime(new Date("2026-11-25T10:59:00.000Z"), PARIS)).toBe(true);
    expect(isBriefTime(new Date("2026-11-25T11:00:00.000Z"), PARIS)).toBe(false);
  });

  it("suit le fuseau : 8 h à Paris n'est pas 8 h à New York", () => {
    const now = new Date("2026-11-25T07:30:00.000Z");
    expect(isBriefTime(now, "America/New_York")).toBe(false);
  });
});

describe("localDay et dayBounds", () => {
  it("donne le jour local, pas le jour UTC", () => {
    expect(localDay(new Date("2026-11-25T23:30:00.000Z"), PARIS)).toBe("2026-11-26");
  });

  it("borne la journée de minuit à minuit locaux", () => {
    const { from, to } = dayBounds(new Date("2026-11-25T07:30:00.000Z"), PARIS);

    expect(from.toISOString()).toBe("2026-11-24T23:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-25T23:00:00.000Z");
  });
});

describe("describeAgenda", () => {
  const items: BriefItem[] = [
    { startsAt: "2026-11-25T13:00:00.000Z", allDay: false, title: "Kiné", list: false },
    { startsAt: "2026-11-25T08:30:00.000Z", allDay: false, title: "Courses", list: true },
    { startsAt: "2026-11-24T23:00:00.000Z", allDay: true, title: "Anniversaire Léa", list: false },
  ];

  it("met la journée entière d'abord, puis les heures dans l'ordre", () => {
    expect(describeAgenda(items, PARIS)).toEqual([
      "- toute la journée : Anniversaire Léa",
      "- 9h30 : Courses (liste)",
      "- 14h : Kiné",
    ]);
  });

  it("ne touche pas au tableau reçu", () => {
    const before = items.map((item) => item.title);
    describeAgenda(items, PARIS);
    expect(items.map((item) => item.title)).toEqual(before);
  });
});

describe("briefMessage", () => {
  it("pose l'introduction puis l'agenda, tel quel", () => {
    const message = briefMessage(
      "Bonjour Yann, voici ta journée :",
      [{ startsAt: "2026-11-25T13:00:00.000Z", allDay: false, title: "Kiné", list: false }],
      PARIS,
    );

    expect(message).toBe("Bonjour Yann, voici ta journée :\n- 14h : Kiné");
  });

  it("a une introduction de secours, avec ou sans prénom", () => {
    expect(fixedGreeting("Yann")).toBe("Bonjour Yann, voici ta journée :");
    expect(fixedGreeting(null)).toBe("Bonjour, voici ta journée :");
  });
});
