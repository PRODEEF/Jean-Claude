import { colorIndexOf, groupByDay, initialsOf } from "./mail";

describe("initialsOf", () => {
  it("prend la première lettre du prénom et du nom", () => {
    expect(initialsOf("Grégoire Rouquette")).toBe("GR");
  });

  it("ne garde qu'une lettre pour un nom d'un seul mot", () => {
    expect(initialsOf("vercel[bot]")).toBe("V");
  });

  it("lit le premier expéditeur quand il y en a plusieurs", () => {
    expect(initialsOf("Mallaury Sibbald, Clarisse")).toBe("MS");
  });

  it("découpe une adresse e-mail au point et à l'arobase", () => {
    expect(initialsOf("marie.durand@exemple.fr")).toBe("MD");
  });

  it("rend un point d'interrogation quand il n'y a rien à lire", () => {
    expect(initialsOf("")).toBe("?");
  });
});

describe("colorIndexOf", () => {
  it("rend la même couleur pour le même expéditeur", () => {
    expect(colorIndexOf("Clarisse", 8)).toBe(colorIndexOf("clarisse", 8));
  });

  it("reste dans les bornes de la liste", () => {
    for (const name of ["a", "Clarisse", "vercel[bot]", "Grégoire Rouquette", ""]) {
      const index = colorIndexOf(name, 8);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(8);
    }
  });

  it("rend 0 quand la liste est vide", () => {
    expect(colorIndexOf("Clarisse", 0)).toBe(0);
  });
});

describe("groupByDay", () => {
  // Jeudi 19 novembre 2026, 15h.
  const now = new Date(2026, 10, 19, 15, 0, 0);
  const at = (y: number, m: number, d: number, h = 10) => ({
    date: new Date(y, m - 1, d, h).toISOString(),
  });

  it("range sous Aujourd'hui, Hier, Cette semaine et Plus ancien", () => {
    const groups = groupByDay(
      [at(2026, 11, 19, 9), at(2026, 11, 18), at(2026, 11, 16), at(2026, 11, 15)],
      now,
    );

    expect(groups.map((group) => [group.label, group.items.length])).toEqual([
      ["Aujourd'hui", 1],
      ["Hier", 1],
      ["Cette semaine", 1],
      ["Plus ancien", 1],
    ]);
  });

  it("commence la semaine le lundi", () => {
    const groups = groupByDay([at(2026, 11, 16, 0), at(2026, 11, 15, 23)], now);

    expect(groups.map((group) => group.label)).toEqual(["Cette semaine", "Plus ancien"]);
  });

  it("n'invente pas de paquet vide", () => {
    expect(groupByDay([at(2026, 11, 19)], now).map((group) => group.label)).toEqual([
      "Aujourd'hui",
    ]);
  });

  it("garde l'ordre reçu à l'intérieur d'un paquet", () => {
    const first = { ...at(2026, 11, 19, 14), id: 1 };
    const second = { ...at(2026, 11, 19, 8), id: 2 };

    expect(groupByDay([first, second], now)[0]?.items.map((item) => item.id)).toEqual([1, 2]);
  });

  it("met un mail sans date à la fin, sous « Date inconnue »", () => {
    const groups = groupByDay([{ date: null }, at(2026, 11, 19)], now);

    expect(groups.map((group) => group.label)).toEqual(["Aujourd'hui", "Date inconnue"]);
  });

  it("compte pour aujourd'hui un mail daté du futur", () => {
    expect(groupByDay([at(2026, 11, 25)], now)[0]?.label).toBe("Aujourd'hui");
  });

  it("rend une liste vide pour aucun mail", () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});
