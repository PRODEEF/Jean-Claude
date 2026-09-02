import { Hono } from "hono";
import { isoDateTimeSchema, searchQuerySchema } from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { validate } from "../../core/http.js";
import { userRepository } from "../../domain/user/user.repository.js";
import { searchRepository } from "./search.repository.js";
import { SearchService } from "./search.service.js";

const service = new SearchService(searchRepository, userRepository);

const querySchema = searchQuerySchema.extend({ cursor: isoDateTimeSchema.optional() });

export const searchRoutes = new Hono<AuthEnv>()
  .use(auth)

  .get("/", validate("query", querySchema), async (c) => {
    const user = c.get("user");
    return c.json(await service.search(user.id, user.accessToken, c.req.valid("query")));
  });
