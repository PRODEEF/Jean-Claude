import {
  afternoonMessage,
  briefMessage,
  briefWindow,
  eveningMessage,
  tomorrowBounds,
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
    {
      startsAt: "2026-11-25T13:00:00.000Z",
      allDay: false,
      title: "Kiné",
      list: false,
      done: false,
    },
    {
      startsAt: "2026-11-25T08:30:00.000Z",
      allDay: false,
      title: "Courses",
      list: true,
      done: false,
    },
    {
      startsAt: "2026-11-24T23:00:00.000Z",
      allDay: true,
      title: "Anniversaire Léa",
      list: false,
      done: false,
    },
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
      [
        {
          startsAt: "2026-11-25T13:00:00.000Z",
          allDay: false,
          title: "Kiné",
          list: false,
          done: false,
        },
      ],
      PARIS,
    );

    expect(message).toBe("Bonjour Yann, voici ta journée :\n- 14h : Kiné");
  });

  it("a une introduction de secours, avec ou sans prénom", () => {
    expect(fixedGreeting("Yann")).toBe("Bonjour Yann, voici ta journée :");
    expect(fixedGreeting(null)).toBe("Bonjour, voici ta journée :");
  });
});

// Mercredi 25 novembre 2026 à Paris (UTC+1).
const todayAt = (hourParis: number, minute = 0) =>
  new Date(Date.UTC(2026, 10, 25, hourParis - 1, minute)).toISOString();
const item = (hour: number, title: string, over: Partial<BriefItem> = {}): BriefItem => ({
  startsAt: todayAt(hour),
  allDay: false,
  title,
  list: false,
  done: false,
  ...over,
});

describe("briefWindow et isBriefTime — après-midi et soir", () => {
  it("suit les limites « Après-midi » et « Soir » des Réglages", () => {
    expect(briefWindow("afternoon", { afternoonFrom: 13, eveningFrom: 18 })).toEqual({
      from: 13,
      until: 18,
    });
    expect(briefWindow("evening", { afternoonFrom: 13, eveningFrom: 18 })).toEqual({
      from: 18,
      until: 23,
    });
  });

  it("part quand l'après-midi commence, pas avant, et s'arrête quand le soir commence", () => {
    const bounds = { afternoonFrom: 14, eveningFrom: 19 };
    const at = (hour: number) => new Date(Date.UTC(2026, 10, 25, hour - 1, 5));

    expect(isBriefTime(at(13), PARIS, "afternoon", bounds)).toBe(false);
    expect(isBriefTime(at(14), PARIS, "afternoon", bounds)).toBe(true);
    expect(isBriefTime(at(19), PARIS, "afternoon", bounds)).toBe(false);
    expect(isBriefTime(at(19), PARIS, "evening", bounds)).toBe(true);
    expect(isBriefTime(at(23), PARIS, "evening", bounds)).toBe(false);
  });

  it("garde la plage du matin fixe, quelles que soient les limites", () => {
    const at = new Date(Date.UTC(2026, 10, 25, 7, 5));

    expect(isBriefTime(at, PARIS, "morning", { afternoonFrom: 9, eveningFrom: 15 })).toBe(true);
  });
});

describe("tomorrowBounds", () => {
  it("donne le lendemain local, de minuit à minuit", () => {
    const { from, to } = tomorrowBounds(new Date("2026-11-25T10:00:00.000Z"), PARIS);

    expect(from.toISOString()).toBe("2026-11-25T23:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-26T23:00:00.000Z");
  });
});

describe("fixedGreeting selon le point", () => {
  it("a une phrase pour chaque moment", () => {
    expect(fixedGreeting("Yann", "afternoon")).toBe(
      "Bon après-midi Yann, voici ce qu'il te reste à faire :",
    );
    expect(fixedGreeting("Yann", "evening")).toBe("Bonsoir Yann, voici le bilan de ta journée :");
    expect(fixedGreeting(null, "evening")).toBe("Bonsoir, voici le bilan de ta journée :");
  });
});

describe("afternoonMessage", () => {
  const NOW = new Date(todayAt(14));

  it("ne garde que ce qu'il reste à faire : ni le fait, ni le rendez-vous passé", () => {
    const message = afternoonMessage(
      "Bon après-midi :",
      [
        item(10, "Kiné", { done: false }),
        item(11, "Courses", { list: true, done: true }),
        item(16, "Dentiste"),
        item(9, "PRO", { list: true }),
      ],
      NOW,
      PARIS,
    );

    // Le rendez-vous de 10 h est passé ; la liste PRO, non cochée, reste à faire même à 9 h.
    expect(message).toBe("Bon après-midi :\n- 9h : PRO (liste)\n- 16h : Dentiste");
  });

  it("dit que l'après-midi est calme plutôt que de se taire", () => {
    const message = afternoonMessage("Bon après-midi :", [item(9, "Kiné")], NOW, PARIS);

    expect(message).toContain("Après-midi calme");
  });

  it("dit aussi qu'il est calme quand tout est fait", () => {
    const message = afternoonMessage(
      "Bon après-midi :",
      [item(9, "PRO", { list: true, done: true })],
      NOW,
      PARIS,
    );

    expect(message).toContain("Après-midi calme");
  });
});

describe("eveningMessage", () => {
  const NOW = new Date(todayAt(19, 5));
  const bounds = { afternoonFrom: 12, eveningFrom: 19 };

  it("fait le bilan, dit ce qui reste, le programme du soir et demain", () => {
    const message = eveningMessage(
      "Bonsoir :",
      [
        item(10, "Kiné", { list: true, done: true }),
        item(14, "Dossier", { list: true }),
        item(20, "Raclette"),
      ],
      [{ ...item(10, "Réunion"), startsAt: "2026-11-26T09:00:00.000Z" }],
      NOW,
      PARIS,
      bounds,
    );

    expect(message).toBe(
      [
        "Bonsoir :",
        "Bilan : 1 fait sur 3.",
        "Il reste à faire :",
        "- 14h : Dossier (liste)",
        "Au programme ce soir :",
        "- 20h : Raclette",
        "Demain :",
        "- 10h : Réunion",
      ].join("\n"),
    );
  });

  it("ne propose pas de programme du soir quand rien n'est prévu ce soir", () => {
    const message = eveningMessage(
      "Bonsoir :",
      [item(10, "Kiné", { done: true })],
      [],
      NOW,
      PARIS,
      bounds,
    );

    expect(message).not.toContain("Au programme ce soir");
    expect(message).toContain("Bilan : 1 fait sur 1.");
    expect(message).toContain("Demain : rien de prévu pour l'instant.");
  });

  it("accorde « faits » au pluriel", () => {
    const message = eveningMessage(
      "Bonsoir :",
      [item(9, "A", { done: true }), item(10, "B", { done: true })],
      [],
      NOW,
      PARIS,
      bounds,
    );

    expect(message).toContain("Bilan : 2 faits sur 2.");
  });

  it("dit que la soirée est calme quand ni aujourd'hui ni demain n'ont rien", () => {
    const message = eveningMessage("Bonsoir :", [], [], NOW, PARIS, bounds);

    expect(message).toContain("Soirée calme");
  });

  it("dit que la journée était tranquille mais montre demain", () => {
    const message = eveningMessage(
      "Bonsoir :",
      [],
      [{ ...item(10, "Réunion"), startsAt: "2026-11-26T09:00:00.000Z" }],
      NOW,
      PARIS,
      bounds,
    );

    expect(message).toContain("Journée tranquille");
    expect(message).toContain("- 10h : Réunion");
  });
});
