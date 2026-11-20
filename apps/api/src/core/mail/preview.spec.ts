import { PREVIEW_LENGTH, previewOf } from "./preview.js";

describe("previewOf", () => {
  it("rend le début du texte sur une seule ligne", () => {
    expect(previewOf("Bonjour,\n\nOn dîne samedi ?\n")).toBe("Bonjour, On dîne samedi ?");
  });

  it("retire les lignes citées d'un mail auquel on répond", () => {
    expect(previewOf("D'accord pour jeudi.\n> Peux-tu confirmer ?\n> Merci")).toBe(
      "D'accord pour jeudi.",
    );
  });

  it("retire les adresses web collées dans le texte", () => {
    expect(previewOf("Voir https://exemple.fr/page?x=1 pour le détail")).toBe(
      "Voir pour le détail",
    );
  });

  it("coupe un texte long avec des points de suspension", () => {
    const result = previewOf("mot ".repeat(100));

    expect(result.length).toBeLessThanOrEqual(PREVIEW_LENGTH + 1);
    expect(result.endsWith("…")).toBe(true);
  });

  it("rend une chaîne vide quand il n'y a pas de texte", () => {
    expect(previewOf(null)).toBe("");
    expect(previewOf("")).toBe("");
    expect(previewOf("> tout est cité")).toBe("");
  });
});
