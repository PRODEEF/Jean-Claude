import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "../auth/auth.middleware.js";
import { httpError } from "../http.js";
import { logger } from "../logger.js";
import { evaluateRateLimit, type RateLimitDecision } from "./rate-limit-policy.js";
import { rateLimitRepository } from "./rate-limit.repository.js";

const SCOPE = "rate-limit.middleware";

/**
 * Borne le nombre de messages envoyés au moteur IA par utilisateur.
 *
 * Fail-open : une panne de cette table ne doit jamais empêcher d'utiliser
 * l'assistant — c'est une protection secondaire contre l'abus du budget
 * partagé, pas la fonctionnalité principale du produit. Une vraie garantie
 * sous forte simultanéité demanderait une fonction SQL dédiée, écartée ici :
 * décider du seuil et de la fenêtre est une règle produit, qui doit rester en
 * TypeScript, testable et partagée (convention des migrations du dépôt).
 */
export const rateLimit = createMiddleware<AuthEnv>(async (c, next) => {
  const user = c.get("user");
  const decision = await safeEvaluate(user.id, user.accessToken);

  if (decision && !decision.allowed) {
    throw httpError(
      429,
      `Trop de messages envoyés à l'assistant. Réessayez dans ${decision.retryAfterSeconds} secondes.`,
    );
  }

  await next();
});

/** `null` sur panne technique : le message est alors laissé passer. */
async function safeEvaluate(
  userId: string,
  accessToken: string,
): Promise<RateLimitDecision | null> {
  try {
    const current = await rateLimitRepository.find(userId, accessToken);
    const decision = evaluateRateLimit(current, new Date());

    if (decision.allowed) await rateLimitRepository.save(userId, decision.next, accessToken);
    return decision;
  } catch (error) {
    logger.error(
      SCOPE,
      "Vérification du débit impossible, message laissé passer",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
