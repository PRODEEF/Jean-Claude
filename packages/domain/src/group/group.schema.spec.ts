import {
  sendGroupMessageSchema,
  completeAssistantMention,
  mentionsAssistant,
} from "./group.schema";

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

describe("completeAssistantMention", () => {
  const NAME = "Jean-Claude";

  it("propose le nom dès l'arobase seule", () => {
    expect(completeAssistantMention("@", NAME)).toBe("@Jean-Claude ");
  });

  it("complète un début de nom, sans tenir compte de la casse ni des accents", () => {
    expect(completeAssistantMention("Salut @jea", NAME)).toBe("Salut @Jean-Claude ");
    expect(completeAssistantMention("@JÉAN-c", NAME)).toBe("@Jean-Claude ");
  });

  it("ne propose rien quand le nom est déjà complet", () => {
    expect(completeAssistantMention("@Jean-Claude", NAME)).toBeNull();
  });

  it("ne propose rien si ce qui suit l'arobase ne commence pas le nom", () => {
    expect(completeAssistantMention("@yann", NAME)).toBeNull();
  });

  it("ne propose rien pour une arobase au milieu d'un mot ou avant la fin du texte", () => {
    expect(completeAssistantMention("écris à mail@jea", NAME)).toBeNull();
    expect(completeAssistantMention("@jea et la suite", NAME)).toBeNull();
    expect(completeAssistantMention("Bonjour", NAME)).toBeNull();
  });
});

describe("sendGroupMessageSchema", () => {
  const FILE_ID = "4f1c2a3b-5d6e-4f70-8a9b-0c1d2e3f4a5b";

  it("accepte un fichier seul, sans texte", () => {
    expect(
      sendGroupMessageSchema.safeParse({ content: "", attachmentIds: [FILE_ID] }).success,
    ).toBe(true);
  });

  it("refuse un message sans texte ni fichier", () => {
    expect(sendGroupMessageSchema.safeParse({ content: "   " }).success).toBe(false);
  });

  it("n'exige pas de fichier pour un message écrit", () => {
    const parsed = sendGroupMessageSchema.parse({ content: "Bonjour" });
    expect(parsed.attachmentIds).toEqual([]);
  });
});
