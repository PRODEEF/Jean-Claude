import { Global, Module } from "@nestjs/common";
import { JwtGuard } from "./guards/jwt.guard";

/**
 * Authentification.
 *
 * L'émission des codes OTP par e-mail (§6.1) est déléguée à Supabase Auth :
 * l'app appelle directement `signInWithOtp` / `verifyOtp`, sans passer par
 * cette API. Le backend ne fait que vérifier les tokens résultants, ce qui
 * évite de réimplémenter — et de sécuriser — un flux OTP maison sur le sprint.
 *
 * La 2FA par SMS (§6.2) s'ajoutera ici, via le MFA Supabase.
 */
@Global()
@Module({
  providers: [JwtGuard],
  exports: [JwtGuard],
})
export class AuthModule {}
