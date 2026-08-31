import { HttpException, HttpStatus, ServiceUnavailableException } from "@nestjs/common";

/**
 * Traduction des échecs du moteur IA en erreurs HTTP présentables.
 *
 * Fichier séparé de l'adaptateur pour une raison concrète et non de découpage :
 * `gateway.provider.ts` importe le SDK `ai`, qui est ESM seul. Un test qui
 * passerait par lui entraînerait tout l'arbre ESM dans Jest, qui compile en
 * CommonJS. Ici, aucune dépendance — la règle reste couverte par des tests.
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
export function toHttpException(error: unknown): HttpException {
  switch (upstreamStatus(error)) {
    case HttpStatus.TOO_MANY_REQUESTS:
      return new HttpException(
        "Trop de requêtes d'affilée. Réessayez dans un instant.",
        HttpStatus.TOO_MANY_REQUESTS,
      );

    case HttpStatus.PAYMENT_REQUIRED:
      return new HttpException("Le crédit du moteur IA est épuisé.", HttpStatus.PAYMENT_REQUIRED);

    default:
      return new ServiceUnavailableException("Le moteur IA est momentanément indisponible.");
  }
}
