import { draftFor } from "./compose";
import type { MailMessage } from "./mail.schema";

function mail(overrides: Partial<MailMessage> = {}): MailMessage {
  return {
    accountId: "00000000-0000-4000-8000-0000000000a1",
    uid: 1,
    from: "Marie <marie@ex.fr>",
    to: "yann@ex.fr, paul@ex.fr",
    subject: "Devis",
    date: null,
    seen: true,
    flagged: false,
    text: "Bonjour\nà demain",
    html: null,
    attachments: [],
    messageId: "<abc@ex.fr>",
    replyTo: ["marie@ex.fr"],
    toList: ["yann@ex.fr", "paul@ex.fr"],
    ccList: ["luc@ex.fr"],
    ...overrides,
  };
}

describe("draftFor", () => {
  it("répond à l'expéditeur seul, en citant le mail et en gardant la conversation groupée", () => {
    const draft = draftFor("reply", mail(), "yann@ex.fr");

    expect(draft.to).toEqual(["marie@ex.fr"]);
    expect(draft.cc).toEqual([]);
    expect(draft.subject).toBe("Re : Devis");
    expect(draft.text).toContain("> Bonjour\n> à demain");
    expect(draft.inReplyTo).toBe("<abc@ex.fr>");
  });

  it("répond à tous sans s'écrire à soi-même ni doubler un destinataire", () => {
    const draft = draftFor(
      "replyAll",
      mail({ ccList: ["luc@ex.fr", "Marie@ex.fr"] }),
      "Yann@ex.fr",
    );

    expect(draft.to).toEqual(["marie@ex.fr"]);
    expect(draft.cc).toEqual(["paul@ex.fr", "luc@ex.fr"]);
  });

  it("n'empile pas les « Re : »", () => {
    expect(draftFor("reply", mail({ subject: "Re : Devis" }), "y@ex.fr").subject).toBe(
      "Re : Devis",
    );
  });

  it("transfère sans destinataire et avec l'en-tête du mail d'origine", () => {
    const draft = draftFor("forward", mail(), "yann@ex.fr");

    expect(draft.to).toEqual([]);
    expect(draft.subject).toBe("Tr : Devis");
    expect(draft.text).toContain("Objet : Devis");
    expect(draft.text).toContain("Bonjour");
    expect(draft.inReplyTo).toBeUndefined();
  });

  it("répond sans citation quand le mail n'a pas de texte", () => {
    const draft = draftFor("reply", mail({ text: null, messageId: null }), "yann@ex.fr");

    expect(draft.inReplyTo).toBeUndefined();
    expect(draft.text).toContain("a écrit");
  });
});
