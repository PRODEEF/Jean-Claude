import { parseRelativeDateFr } from "./relative-date.js";

const PARIS = "Europe/Paris";

/** Lundi 7 septembre 2026, midi à Paris (heure d'été, UTC+2). */
const LUNDI = new Date("2026-09-07T10:00:00.000Z");
/** Vendredi 11 septembre 2026, midi à Paris. */
const VENDREDI = new Date("2026-09-11T10:00:00.000Z");
/** Samedi 12 septembre 2026, midi à Paris. */
const SAMEDI = new Date("2026-09-12T10:00:00.000Z");
/** Dimanche 13 septembre 2026, midi à Paris. */
const DIMANCHE = new Date("2026-09-13T10:00:00.000Z");

describe("parseRelativeDateFr", () => {
  describe("demain, après-demain", () => {
    it("renvoie le lendemain à minuit", () => {
      expect(parseRelativeDateFr("demain", LUNDI, PARIS)).toBe("2026-09-07T22:00:00.000Z");
    });

    it("renvoie le surlendemain à minuit", () => {
      expect(parseRelativeDateFr("après-demain", LUNDI, PARIS)).toBe("2026-09-08T22:00:00.000Z");
    });
  });

  describe("jours de la semaine", () => {
    it("renvoie toujours la prochaine occurrence, jamais aujourd'hui", () => {
      // Un lundi, « lundi » ne peut pas désigner aujourd'hui : la semaine
      // suivante, pas une échéance déjà passée.
      expect(parseRelativeDateFr("lundi", LUNDI, PARIS)).toBe("2026-09-13T22:00:00.000Z");
    });

    it("ne renvoie jamais un jour déjà passé cette semaine", () => {
      // Vérifié empiriquement bugué dans chrono-node (§ commentaire du
      // module) : un lundi, « vendredi » doit désigner le vendredi à venir,
      // pas celui de la semaine passée.
      expect(parseRelativeDateFr("vendredi", LUNDI, PARIS)).toBe("2026-09-10T22:00:00.000Z");
    });

    it("accepte la mention explicite « prochain », avec le même résultat", () => {
      expect(parseRelativeDateFr("lundi prochain", LUNDI, PARIS)).toBe("2026-09-13T22:00:00.000Z");
    });

    it("est insensible à la casse", () => {
      expect(parseRelativeDateFr("Vendredi", LUNDI, PARIS)).toBe("2026-09-10T22:00:00.000Z");
    });
  });

  describe("dans N jours / semaines", () => {
    it("compte les jours en chiffres", () => {
      expect(parseRelativeDateFr("dans 3 jours", LUNDI, PARIS)).toBe("2026-09-09T22:00:00.000Z");
    });

    it("compte les semaines en toutes lettres", () => {
      expect(parseRelativeDateFr("dans deux semaines", LUNDI, PARIS)).toBe(
        "2026-09-20T22:00:00.000Z",
      );
    });

    it("traite « une semaine » comme un singulier valide", () => {
      expect(parseRelativeDateFr("dans une semaine", LUNDI, PARIS)).toBe(
        "2026-09-13T22:00:00.000Z",
      );
    });
  });

  describe("week-end", () => {
    it("vise le prochain samedi en semaine", () => {
      expect(parseRelativeDateFr("ce week-end", LUNDI, PARIS)).toBe("2026-09-11T22:00:00.000Z");
    });

    it("reste sur le jour même quand on y est déjà (samedi)", () => {
      expect(parseRelativeDateFr("ce week-end", SAMEDI, PARIS)).toBe("2026-09-11T22:00:00.000Z");
    });

    it("reste sur le week-end en cours un dimanche", () => {
      expect(parseRelativeDateFr("ce week-end", DIMANCHE, PARIS)).toBe("2026-09-12T22:00:00.000Z");
    });

    it("accepte l'orthographe sans tiret", () => {
      expect(parseRelativeDateFr("ce weekend", LUNDI, PARIS)).toBe("2026-09-11T22:00:00.000Z");
    });

    it("vise une semaine de plus pour « le week-end prochain »", () => {
      expect(parseRelativeDateFr("le week-end prochain", LUNDI, PARIS)).toBe(
        "2026-09-18T22:00:00.000Z",
      );
    });

    it("vise le vendredi de la semaine en cours pour « avant le week-end »", () => {
      expect(parseRelativeDateFr("avant le week-end", LUNDI, PARIS)).toBe(
        "2026-09-10T22:00:00.000Z",
      );
    });

    it("inclut aujourd'hui quand on est déjà vendredi", () => {
      expect(parseRelativeDateFr("avant le week-end", VENDREDI, PARIS)).toBe(
        "2026-09-10T22:00:00.000Z",
      );
    });

    it("renvoie null pour « avant le week-end » un samedi — le week-end a déjà commencé", () => {
      expect(parseRelativeDateFr("avant le week-end", SAMEDI, PARIS)).toBeNull();
    });
  });

  describe("expressions non couvertes", () => {
    it("renvoie null sur une date absolue", () => {
      expect(parseRelativeDateFr("le 15 septembre", LUNDI, PARIS)).toBeNull();
    });

    it("renvoie null sur une expression avec une heure", () => {
      expect(parseRelativeDateFr("mardi à 18h", LUNDI, PARIS)).toBeNull();
    });

    it("renvoie null sur une phrase plutôt qu'une expression courte", () => {
      expect(
        parseRelativeDateFr("il faudrait le faire dans les prochains jours", LUNDI, PARIS),
      ).toBeNull();
    });

    it("renvoie null sur une chaîne vide", () => {
      expect(parseRelativeDateFr("", LUNDI, PARIS)).toBeNull();
    });
  });

  describe("fuseau horaire", () => {
    it("suit le fuseau du profil et non celui du serveur", () => {
      // 23 h UTC un lundi : déjà mardi à Paris (UTC+2), encore lundi à
      // Tahiti (UTC-10). « demain » ne doit pas désigner le même jour aux
      // deux endroits.
      const now = new Date("2026-09-07T23:00:00.000Z");

      expect(parseRelativeDateFr("demain", now, PARIS)).toBe("2026-09-08T22:00:00.000Z");
      expect(parseRelativeDateFr("demain", now, "Pacific/Tahiti")).toBe("2026-09-08T10:00:00.000Z");
    });
  });
});
