import { toHttpException } from "./llm-error.js";

/**
 * Forme d'une erreur du SDK `ai` : un objet portant `statusCode` et un message
 * qui peut citer le prompt. On ne construit pas une vraie `APICallError` ici —
 * l'importer ferait entrer tout l'arbre du SDK dans Jest.
 */
function upstreamError(statusCode: number) {
  return Object.assign(new Error("Prompt: « ma mutuelle rembourse-t-elle... » — quota exceeded"), {
    statusCode,
  });
}

describe("toHttpException", () => {
  it("distingue un quota dépassé d'une panne", () => {
    const exception = toHttpException(upstreamError(429));

    expect(exception.status).toBe(429);
    expect(exception.message).toContain("Réessayez");
  });

  it("signale un crédit épuisé, que patienter ne résoudra pas", () => {
    const exception = toHttpException(upstreamError(402));

    expect(exception.status).toBe(402);
    expect(exception.message).toContain("crédit");
  });

  it("retombe sur une indisponibilité générique pour tout autre échec", () => {
    expect(toHttpException(upstreamError(500)).status).toBe(503);
    expect(toHttpException(new Error("réseau coupé")).status).toBe(503);
    expect(toHttpException(undefined).status).toBe(503);
  });

  it("ne reprend jamais le message du fournisseur, qui peut citer le prompt", () => {
    const exception = toHttpException(upstreamError(429));

    expect(exception.message).not.toContain("mutuelle");
    expect(exception.message).not.toContain("quota exceeded");
  });
});
