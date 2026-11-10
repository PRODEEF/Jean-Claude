import { Hono } from "hono";
import { bearerMatches } from "../../core/cron.js";
import { config } from "../../core/config.js";
import { httpError } from "../../core/http.js";
import { reminderRepository } from "./reminder.repository.js";
import { ReminderService } from "./reminder.service.js";

const service = new ReminderService(reminderRepository);

/**
 * Appelé par le planificateur toutes les quelques minutes, pas par l'application.
 *
 * Il ne passe pas par `auth` : il n'y a pas d'utilisateur derrière. Il s'ouvre
 * avec le secret du planificateur, et reste fermé tant que celui-ci n'est pas
 * configuré.
 */
export const reminderRoutes = new Hono().post("/", async (c) => {
  if (!bearerMatches(c.req.header("authorization"), config.cronSecret)) {
    throw httpError(401, "Accès refusé.");
  }

  return c.json(await service.run());
});
