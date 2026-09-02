import { Hono } from "hono";
import { z } from "zod";
import {
  calendarRangeSchema,
  createCalendarEventSchema,
  updateCalendarEventSchema,
  uuidSchema,
} from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { validate } from "../../core/http.js";
import { calendarRepository } from "./calendar.repository.js";
import { CalendarService } from "./calendar.service.js";

const service = new CalendarService(calendarRepository);

const idParam = validate("param", z.object({ id: uuidSchema }));

export const calendarRoutes = new Hono<AuthEnv>()
  .use(auth)

  /**
   * Pas de pagination par curseur ici, contrairement aux conversations : la
   * fenêtre est bornée par l'appelant, et une vue mois ou semaine se lit d'un
   * bloc — un chargement partiel y laisserait des trous dans la grille.
   */
  .get("/", validate("query", calendarRangeSchema), async (c) =>
    c.json(await service.list(c.req.valid("query"), c.get("user").accessToken)),
  )

  .post("/", validate("json", createCalendarEventSchema), async (c) => {
    const user = c.get("user");
    return c.json(await service.create(user.id, c.req.valid("json"), user.accessToken), 201);
  })

  .patch("/:id", idParam, validate("json", updateCalendarEventSchema), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await service.update(id, c.req.valid("json"), c.get("user").accessToken));
  })

  .delete("/:id", idParam, async (c) => {
    await service.delete(c.req.valid("param").id, c.get("user").accessToken);
    return c.body(null, 204);
  });
