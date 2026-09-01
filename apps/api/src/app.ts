import { Hono } from "hono";
import { cors } from "hono/cors";
import { isAllowedOrigin } from "./core/allowed-origin";
import { config } from "./core/config";
import { onError } from "./core/http";
import { conversationRoutes } from "./domain/conversation/conversation.routes";
import { folderRoutes } from "./domain/folder/folder.routes";
import { assistantRoutes } from "./feature/assistant/assistant.routes";
import { healthRoutes } from "./feature/health/health.routes";

const allowedOrigins = config.corsOrigin.split(",");

/**
 * Application HTTP.
 *
 * Le préfixe `/api` est posé ici une fois pour toutes — `@jc/api-client`
 * construit ses URL avec. Aucun état de démarrage : l'objet exporté est
 * directement servable par Node comme par un runtime serverless.
 */
export const app = new Hono()
  .use(
    "*",
    cors({
      // On renvoie l'origine appelante plutôt que `*`, sans quoi le navigateur
      // refuse les requêtes authentifiées.
      origin: (origin) =>
        config.corsOrigin === "*" || isAllowedOrigin(origin, allowedOrigins) ? origin : null,
      credentials: true,
    }),
  )
  .route("/api/folders", folderRoutes)
  .route("/api/conversations", conversationRoutes)
  .route("/api/assistant", assistantRoutes)
  .route("/api/health", healthRoutes)
  .onError(onError);
