import { HttpStatus } from "@nestjs/common";
import { toHttpException } from "./llm-error";

/**
 * Forme d'une erreur du SDK `ai` : un objet portant `statusCode` et un message
 * qui peut citer le prompt. On ne construit pas une vraie `APICallError` ici —
 * l'importer ferait entrer tout l'arbre ESM du SDK dans Jest.
 */
function upstreamError(statusCode: number) {
  return Object.assign(new Error("Prompt: « ma mutuelle rembourse-t-elle... » — quota exceeded"), {
    statusCode,
  });
}

describe("toHttpException", () => {
  it("distingue un quota dépassé d'une panne", () => {
    const exception = toHttpException(upstreamError(429));

    expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(exception.message).toContain("Réessayez");
  });

  it("signale un crédit épuisé, que patienter ne résoudra pas", () => {
    const exception = toHttpException(upstreamError(402));

    expect(exception.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect(exception.message).toContain("crédit");
  });

  it("retombe sur une indisponibilité générique pour tout autre échec", () => {
    expect(toHttpException(upstreamError(500)).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(toHttpException(new Error("réseau coupé")).getStatus()).toBe(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    expect(toHttpException(undefined).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it("ne reprend jamais le message du fournisseur, qui peut citer le prompt", () => {
    const exception = toHttpException(upstreamError(429));

    expect(exception.message).not.toContain("mutuelle");
    expect(exception.message).not.toContain("quota exceeded");
  });
});
