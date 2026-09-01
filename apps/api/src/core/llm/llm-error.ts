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

/** Statut HTTP renvoyé par le fournisseur, quand l'erreur en porte un. */
function upstreamStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return undefined;
  const { statusCode } = error as { statusCode: unknown };
  return typeof statusCode === "number" ? statusCode : undefined;
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
