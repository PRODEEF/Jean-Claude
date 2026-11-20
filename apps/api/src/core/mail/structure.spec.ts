import { hasAttachments } from "./structure.js";

describe("hasAttachments", () => {
  it("reconnaît une pièce jointe dans un mail à plusieurs parties", () => {
    const structure = {
      childNodes: [{ disposition: undefined }, { disposition: "attachment" }],
    };

    expect(hasAttachments(structure)).toBe(true);
  });

  it("cherche aussi dans les parties imbriquées", () => {
    const structure = { childNodes: [{ childNodes: [{ disposition: "attachment" }] }] };

    expect(hasAttachments(structure)).toBe(true);
  });

  it("ne compte pas une image intégrée au texte", () => {
    expect(hasAttachments({ childNodes: [{ disposition: "inline" }] })).toBe(false);
  });

  it("rend faux pour un mail en texte seul", () => {
    expect(hasAttachments({})).toBe(false);
    expect(hasAttachments(undefined)).toBe(false);
  });

  it("ignore la casse de la disposition", () => {
    expect(hasAttachments({ disposition: "Attachment" })).toBe(true);
  });
});
