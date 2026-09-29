import { waitUntil } from "@vercel/functions";
import { logger } from "./logger.js";

const SCOPE = "core.after-response";

/**
 * Lance un traitement qui se poursuit après l'envoi de la réponse HTTP.
 *
 * Sur Vercel, `waitUntil` garde la fonction en vie jusqu'à la fin de la
 * promesse, dans la limite de `maxDuration` (`vercel.json`). Hors Vercel —
 * serveur de développement Node — il n'y a rien à prolonger : la promesse
 * s'exécute déjà, et le processus ne s'arrête pas avec la requête.
 *
 * Personne n'attend le résultat : une erreur est consignée, jamais remontée.
 */
export function runAfterResponse(task: () => Promise<void>): void {
  waitUntil(
    task().catch((error: unknown) =>
      logger.error(
        SCOPE,
        "Traitement différé en échec",
        error instanceof Error ? error.stack : error,
      ),
    ),
  );
}
