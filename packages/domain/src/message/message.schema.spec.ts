import {
  MESSAGE_ATTACHMENT_MAX_COUNT,
  MESSAGE_ATTACHMENT_MAX_BYTES,
  messageAttachmentMimeTypeSchema,
  sendMessageSchema,
} from "./message.schema";

const ID_1 = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const ID_2 = "3fa85f64-5717-4562-b3fc-2c963f66afa7";
const ID_3 = "3fa85f64-5717-4562-b3fc-2c963f66afa8";
const ID_4 = "3fa85f64-5717-4562-b3fc-2c963f66afa9";
const ID_5 = "3fa85f64-5717-4562-b3fc-2c963f66afb0";

describe("sendMessageSchema", () => {
  it("accepte un texte seul, sans pièce jointe", () => {
    const result = sendMessageSchema.safeParse({ content: "Bonjour" });
    expect(result.success).toBe(true);
  });

  it("accepte une image seule, sans texte — comme Claude", () => {
    const result = sendMessageSchema.safeParse({ content: "", attachmentIds: [ID_1] });
    expect(result.success).toBe(true);
  });

  it("refuse un message sans texte et sans pièce jointe", () => {
    const result = sendMessageSchema.safeParse({ content: "" });
    expect(result.success).toBe(false);
  });

  it("refuse un texte qui ne contient que des espaces, même avec une pièce jointe absente", () => {
    const result = sendMessageSchema.safeParse({ content: "   " });
    expect(result.success).toBe(false);
  });

  it(`refuse plus de ${MESSAGE_ATTACHMENT_MAX_COUNT} pièces jointes`, () => {
    const result = sendMessageSchema.safeParse({
      content: "Regarde ces photos",
      attachmentIds: [ID_1, ID_2, ID_3, ID_4, ID_5],
    });
    expect(result.success).toBe(false);
  });

  it(`accepte exactement ${MESSAGE_ATTACHMENT_MAX_COUNT} pièces jointes`, () => {
    const result = sendMessageSchema.safeParse({
      content: "Regarde ces photos",
      attachmentIds: [ID_1, ID_2, ID_3, ID_4],
    });
    expect(result.success).toBe(true);
  });

  it("laisse `attachmentIds` vide par défaut", () => {
    const result = sendMessageSchema.parse({ content: "Bonjour" });
    expect(result.attachmentIds).toEqual([]);
  });
});

describe("messageAttachmentMimeTypeSchema", () => {
  it("accepte les images et le PDF pris en charge", () => {
    for (const mimeType of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      expect(messageAttachmentMimeTypeSchema.safeParse(mimeType).success).toBe(true);
    }
  });

  it("refuse un format hors périmètre, comme un fichier texte brut", () => {
    expect(messageAttachmentMimeTypeSchema.safeParse("text/plain").success).toBe(false);
  });
});

describe("MESSAGE_ATTACHMENT_MAX_BYTES", () => {
  it("vaut 10 Mo (décision produit)", () => {
    expect(MESSAGE_ATTACHMENT_MAX_BYTES).toBe(10 * 1024 * 1024);
  });
});
