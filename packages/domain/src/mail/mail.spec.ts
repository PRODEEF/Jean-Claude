import { colorIndexOf, initialsOf } from "./mail";

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
