import { resolveDateRange } from "./date-range.js";

const PARIS = "Europe/Paris";

/** Mercredi 2 septembre 2026, 14 h à Paris (heure d'été, UTC+2). */
const NOW = new Date("2026-09-02T12:00:00.000Z");

describe("resolveDateRange", () => {
  it("ne borne rien quand aucun filtre de date n'est posé", () => {
    expect(resolveDateRange({}, PARIS, NOW)).toEqual({});
  });

  describe("raccourcis", () => {
    it("fait commencer la semaine le lundi", () => {
      const range = resolveDateRange({ shortcut: "this_week" }, PARIS, NOW);

      // Lundi 31 août à minuit heure de Paris, soit 22 h UTC la veille.
      expect(range.from).toBe("2026-08-30T22:00:00.000Z");
      expect(range.to).toBe("2026-09-06T22:00:00.000Z");
    });

    it("recule d'une semaine pleine pour « la semaine dernière »", () => {
      const range = resolveDateRange({ shortcut: "last_week" }, PARIS, NOW);

      expect(range.from).toBe("2026-08-23T22:00:00.000Z");
      expect(range.to).toBe("2026-08-30T22:00:00.000Z");
    });

    it("borne « le mois dernier » sur le mois calendaire précédent", () => {
      const range = resolveDateRange({ shortcut: "last_month" }, PARIS, NOW);

      expect(range.from).toBe("2026-07-31T22:00:00.000Z");
      expect(range.to).toBe("2026-08-31T22:00:00.000Z");
    });

    it("borne « cette année » sur l'année calendaire en cours", () => {
      const range = resolveDateRange({ shortcut: "this_year" }, PARIS, NOW);

      // 1er janvier à minuit heure de Paris : heure d'hiver, donc UTC+1.
      expect(range.from).toBe("2025-12-31T23:00:00.000Z");
      expect(range.to).toBe("2026-12-31T23:00:00.000Z");
    });

    it("borne « l'année dernière » sur l'année calendaire précédente", () => {
      const range = resolveDateRange({ shortcut: "last_year" }, PARIS, NOW);

      expect(range.from).toBe("2024-12-31T23:00:00.000Z");
      expect(range.to).toBe("2025-12-31T23:00:00.000Z");
    });

    it("suit le fuseau de l'utilisateur et non celui du serveur", () => {
      const paris = resolveDateRange({ shortcut: "this_month" }, PARIS, NOW);
      const tokyo = resolveDateRange({ shortcut: "this_month" }, "Asia/Tokyo", NOW);

      expect(tokyo.from).not.toBe(paris.from);
      expect(tokyo.from).toBe("2026-08-31T15:00:00.000Z");
    });
  });

  describe("bornes explicites", () => {
    it("inclut le jour de fin en entier", () => {
      const range = resolveDateRange({ from: "2026-03-03", to: "2026-03-05" }, PARIS, NOW);

      expect(range.from).toBe("2026-03-02T23:00:00.000Z");
      // Coupure au début du 6 : sans cela, toute la journée du 5 serait perdue.
      expect(range.to).toBe("2026-03-05T23:00:00.000Z");
    });

    it("accepte une borne seule", () => {
      expect(resolveDateRange({ from: "2026-03-03" }, PARIS, NOW)).toEqual({
        from: "2026-03-02T23:00:00.000Z",
      });
    });

    it("laisse le raccourci l'emporter sur les bornes saisies", () => {
      const range = resolveDateRange(
        { shortcut: "this_year", from: "2026-03-03", to: "2026-03-05" },
        PARIS,
        NOW,
      );

      expect(range.from).toBe("2025-12-31T23:00:00.000Z");
    });
  });
});
