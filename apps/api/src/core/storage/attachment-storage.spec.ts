import { attachmentPath } from "./attachment-storage.js";

describe("attachmentPath", () => {
  it("place l'identifiant utilisateur en premier segment, pour les policies RLS de storage.objects", () => {
    const path = attachmentPath("user-1", "attachment-1", "image/png");
    expect(path.split("/")[0]).toBe("user-1");
  });

  it("choisit l'extension d'après le type MIME", () => {
    expect(attachmentPath("user-1", "att-1", "image/jpeg")).toBe("user-1/att-1.jpg");
    expect(attachmentPath("user-1", "att-1", "image/png")).toBe("user-1/att-1.png");
    expect(attachmentPath("user-1", "att-1", "image/webp")).toBe("user-1/att-1.webp");
  });

  it("est stable pour un même couple (userId, attachmentId)", () => {
    const first = attachmentPath("user-1", "att-1", "image/png");
    const second = attachmentPath("user-1", "att-1", "image/png");
    expect(first).toBe(second);
  });
});
