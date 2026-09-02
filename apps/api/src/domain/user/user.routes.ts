import { Hono } from "hono";
import { updateUserProfileSchema } from "@jc/domain";
import { auth, type AuthEnv } from "../../core/auth/auth.middleware.js";
import { validate } from "../../core/http.js";
import { userRepository } from "./user.repository.js";
import { UserService } from "./user.service.js";

const service = new UserService(userRepository);

/**
 * Profil de l'utilisateur connecté.
 *
 * Aucun `:id` : le profil servi est toujours celui du porteur du jeton. Une
 * route paramétrée inviterait à demander celui d'un autre, que les RLS
 * refuseraient — autant ne pas ouvrir la question.
 */
export const userRoutes = new Hono<AuthEnv>()
  .use(auth)

  .get("/", async (c) => c.json(await service.getProfile(c.get("user"))))

  .patch("/", validate("json", updateUserProfileSchema), async (c) =>
    c.json(await service.updateProfile(c.get("user"), c.req.valid("json"))),
  )

  /**
   * Passer la conversation d'accueil (§6.3, A.13).
   *
   * Une route dédiée plutôt qu'un champ du `PATCH` : l'horodatage d'accueil
   * n'est pas un réglage, et l'ouvrir à l'écriture reviendrait à laisser le
   * client réafficher l'accueil quand bon lui semble.
   */
  .post("/onboarding/complete", async (c) => c.json(await service.completeOnboarding(c.get("user"))));
