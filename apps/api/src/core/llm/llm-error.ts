import type { HTTPException } from "hono/http-exception";
import { httpError } from "../http.js";

/**
 * Traduction des échecs du moteur IA en erreurs HTTP présentables.
 *
 * Fichier séparé de l'adaptateur pour une raison concrète et non de découpage :
 * `gateway.provider.ts` importe le SDK `ai`. Un test qui passerait par lui
 * entraînerait tout son arbre de dépendances dans Jest. Ici, la règle reste
 * couverte par des tests sans rien charger du SDK.
 */

/**
 * Profondeur d'emballage explorée. Deux niveaux suffisent aux formes connues
 * (`RetryError` → `lastError`, `NoOutputGeneratedError` → `cause`) ; la borne
 * est là pour qu'un cycle entre `cause` ne fasse pas boucler la traduction.
 */
const MAX_WRAPPING_DEPTH = 4;

/**
 * Statut HTTP renvoyé par le fournisseur, quand l'erreur en porte un.
 *
 * L'AI SDK emballe : un 429 du Gateway ressort en `RetryError` après trois
 * tentatives, et le statut ne vit plus que dans `lastError`. Sans cette
 * descente, un quota se présenterait comme une panne — exactement la confusion
 * que la traduction ci-dessous cherche à éviter.
 */
function upstreamStatus(error: unknown, depth = 0): number | undefined {
  if (typeof error !== "object" || error === null || depth >= MAX_WRAPPING_DEPTH) return undefined;

  if ("statusCode" in error) {
    const { statusCode } = error as { statusCode: unknown };
    if (typeof statusCode === "number") return statusCode;
  }

  const { lastError, cause } = error as { lastError?: unknown; cause?: unknown };
  return upstreamStatus(lastError, depth + 1) ?? upstreamStatus(cause, depth + 1);
}

/**
 * Seul le **statut** de l'erreur amont est lu, jamais son message : celui-ci
 * peut contenir des fragments de prompt, donc des données utilisateur. Le
 * détail complet part dans les logs serveur.
 *
 * Distinguer ces trois cas n'est pas cosmétique : un quota et une panne
 * appellent des gestes opposés de la part de l'utilisateur — patienter dans un
 * cas, recharger son compte dans l'autre. Les confondre sous un même « moteur
 * indisponible » le laisse attendre une panne qui ne se résoudra pas seule.
 */
export function toHttpException(error: unknown): HTTPException {
  switch (upstreamStatus(error)) {
    case 429:
      return httpError(429, "Trop de requêtes d'affilée. Réessayez dans un instant.");

    case 402:
      return httpError(402, "Le crédit du moteur IA est épuisé.");

    default:
      return httpError(503, "Le moteur IA est momentanément indisponible.");
  }
}
