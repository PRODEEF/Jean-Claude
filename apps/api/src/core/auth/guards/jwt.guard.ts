import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { SupabaseService } from "../../supabase/supabase.service";
import { extractBearerToken } from "../extract-bearer-token";
import type { AuthenticatedUser } from "../types/authenticated-user.types";

/**
 * Exige un access token Supabase valide et peuple `req.user`.
 *
 * Le token est validé auprès de Supabase à chaque requête plutôt que vérifié
 * localement : une session révoquée doit cesser d'ouvrir l'accès immédiatement,
 * ce qui compte pour des données de santé et administratives (§8).
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedUser }>();

    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException("Token d'authentification manquant.");
    }

    const user = await this.supabase.getUser(token);
    if (!user?.email) {
      throw new UnauthorizedException("Session invalide ou expirée.");
    }

    req.user = {
      id: user.id,
      email: user.email,
      accessToken: token,
      emailConfirmedAt: user.email_confirmed_at ?? null,
    };

    return true;
  }
}
