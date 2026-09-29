import { mentionsAssistant } from "./group.schema";

describe("mentionsAssistant", () => {
  it("reconnaît la mention exacte", () => {
    expect(mentionsAssistant("@Jean-Claude tu peux résumer ?")).toBe(true);
  });

  it("ignore la casse, les accents et le trait d'union", () => {
    expect(mentionsAssistant("merci @jean claude")).toBe(true);
    expect(mentionsAssistant("@JÉAN-CLAUDE ?")).toBe(true);
    expect(mentionsAssistant("@jeanclaude")).toBe(true);
  });

  it("reconnaît une mention suivie d'une ponctuation", () => {
    expect(mentionsAssistant("Qu'en penses-tu, @Jean-Claude?")).toBe(true);
  });

  it("ne compte pas le nom cité sans arobase", () => {
    expect(mentionsAssistant("Jean-Claude m'a rappelé la réunion")).toBe(false);
  });

  it("ne compte pas une adresse e-mail", () => {
    expect(mentionsAssistant("écris à contact@jean-claude.fr")).toBe(false);
  });

  it("ne compte pas un autre prénom qui commence pareil", () => {
    expect(mentionsAssistant("@Jean-Claudine tu viens ?")).toBe(false);
  });

  it("rend faux pour un message vide", () => {
    expect(mentionsAssistant("")).toBe(false);
  });
});
