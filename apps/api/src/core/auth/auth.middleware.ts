import { createMiddleware } from "hono/factory";
import { httpError } from "../http";
import { getUser } from "../supabase/supabase";
import { extractBearerToken } from "./extract-bearer-token";

/** Utilisateur résolu par le middleware et posé sur le contexte. */
export type AuthenticatedUser = {
  id: string;
  email: string;
  /**
   * Access token d'origine, retransmis aux Repositories pour que les requêtes
   * Postgres s'exécutent sous l'identité de l'utilisateur (RLS actives).
   */
  accessToken: string;
  emailConfirmedAt: string | null;
};

/** Variables de contexte — c'est elle qui rend `c.get("user")` typé. */
export type AuthEnv = { Variables: { user: AuthenticatedUser } };

/**
 * Exige un access token Supabase valide.
 *
 * Le token est validé auprès de Supabase à chaque requête plutôt que vérifié
 * localement : une session révoquée doit cesser d'ouvrir l'accès immédiatement,
 * ce qui compte pour des données de santé et administratives (§8).
 */
export const auth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = extractBearerToken(c.req.header("Authorization"));
  if (!token) throw httpError(401, "Token d'authentification manquant.");

  const user = await getUser(token);
  if (!user?.email) throw httpError(401, "Session invalide ou expirée.");

  c.set("user", {
    id: user.id,
    email: user.email,
    accessToken: token,
    emailConfirmedAt: user.email_confirmed_at ?? null,
  });

  await next();
});
