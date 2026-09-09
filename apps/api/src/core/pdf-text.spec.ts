import { extractPdfText } from "./pdf-text.js";

/**
 * PDF minimal construit à la main plutôt qu'un fichier binaire versionné :
 * un seul objet `stream` de texte suffit à couvrir ce que la fonction
 * exploite, et la xref aux offsets calculés le rend lisible par pdf.js sans
 * dépendre d'un outil de génération externe.
 */
function buildMinimalPdf(text: string): Uint8Array {
  const objects: Record<number, string> = {
    1: `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    2: `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    3: `3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 200 100] /Contents 5 0 R >>\nendobj\n`,
    4: `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  };
  const stream = `BT /F1 24 Tf 10 50 Td (${text}) Tj ET`;
  objects[5] = `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += objects[i];
  }
  const xrefStart = Buffer.byteLength(pdf, "latin1");
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += xref;
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

describe("extractPdfText", () => {
  it("renvoie le texte d'un PDF valide", async () => {
    const bytes = buildMinimalPdf("Hello World");

    await expect(extractPdfText(bytes)).resolves.toBe("Hello World");
  });

  it("renvoie null pour un buffer qui n'est pas un PDF", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    await expect(extractPdfText(bytes)).resolves.toBeNull();
  });

  it("renvoie null pour un PDF sans aucun texte", async () => {
    const bytes = buildMinimalPdf("");

    await expect(extractPdfText(bytes)).resolves.toBeNull();
  });
});
