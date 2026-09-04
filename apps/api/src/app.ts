import { Hono } from "hono";
import { cors } from "hono/cors";
import { isAllowedOrigin } from "./core/allowed-origin.js";
import { config } from "./core/config.js";
import { onError } from "./core/http.js";
import { calendarRoutes } from "./domain/calendar/calendar.routes.js";
import { conversationRoutes } from "./domain/conversation/conversation.routes.js";
import { feedbackRoutes } from "./domain/feedback/feedback.routes.js";
import { folderRoutes } from "./domain/folder/folder.routes.js";
import { taskRoutes } from "./domain/task/task.routes.js";
import { assistantRoutes } from "./feature/assistant/assistant.routes.js";
import { userRoutes } from "./domain/user/user.routes.js";
import { healthRoutes } from "./feature/health/health.routes.js";
import { searchRoutes } from "./feature/search/search.routes.js";

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
  .route("/api/calendar", calendarRoutes)
  .route("/api/tasks", taskRoutes)
  .route("/api/assistant", assistantRoutes)
  .route("/api/feedback", feedbackRoutes)
  .route("/api/me", userRoutes)
  .route("/api/search", searchRoutes)
  .route("/api/health", healthRoutes)
  .onError(onError);
