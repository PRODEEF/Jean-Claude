import { Hono } from "hono";
import { bearerMatches } from "../../core/cron.js";
import { config } from "../../core/config.js";
import { httpError } from "../../core/http.js";
import { sendReminderEmail } from "../../core/mail/reminder-mail.js";
import { llm } from "../../core/llm/providers/gateway.provider.js";
import { logger } from "../../core/logger.js";
import { createBriefWriter } from "../morning-brief/morning-brief-writer.js";
import { MorningBriefService } from "../morning-brief/morning-brief.service.js";
import { morningBriefRepository } from "../morning-brief/morning-brief.repository.js";
import { reminderRepository } from "./reminder.repository.js";
import { createReminderWriter } from "./reminder-writer.js";
import { ReminderService } from "./reminder.service.js";

const service = new ReminderService(
  reminderRepository,
  sendReminderEmail,
  createReminderWriter(llm),
);

const morningBrief = new MorningBriefService(morningBriefRepository, createBriefWriter(llm));

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

  const reminders = await service.run();

  // Le point du matin voyage avec le même passage du planificateur : un échec
  // ici ne doit jamais retenir les rappels, qui sont partis avant.
  try {
    return c.json({ ...reminders, morningBrief: await morningBrief.run() });
  } catch (error) {
    logger.warn(
      "reminders",
      `Point du matin interrompu : ${error instanceof Error ? error.message : "erreur inconnue"}`,
    );
    return c.json(reminders);
  }
});
