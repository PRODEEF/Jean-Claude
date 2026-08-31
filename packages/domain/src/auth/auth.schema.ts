import { z } from "zod";

/**
 * Authentification par e-mail et code à usage unique (§6.1).
 *
 * Ces règles vivent ici, et non dans l'écran de connexion, pour trois raisons :
 * elles doivent valoir identiquement sur les quatre plateformes, elles doivent
 * valoir identiquement entre le moment où le code est demandé et celui où il
 * est vérifié, et elles se testent sans monter d'interface.
 */

/**
 * Longueur du code envoyé par e-mail.
 *
 * À garder alignée sur `otp_length` dans `supabase/config.toml` : c'est
 * Supabase qui génère le code, cette constante ne fait que le décrire.
 */
export const OTP_CODE_LENGTH = 8;

/**
 * Délai avant qu'un nouveau code puisse être demandé.
 *
 * Aligné sur `max_frequency` de Supabase : en deçà, le fournisseur rejette la
 * demande et l'utilisateur reçoit une erreur au lieu d'un code.
 */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

/**
 * Adresse e-mail normalisée : espaces retirés, casse abaissée.
 *
 * La normalisation appartient au schéma et non à l'appelant, parce que la
 * vérification du code exige exactement la même chaîne que sa demande. Une
 * majuscule saisie au premier écran et pas au second suffirait à faire échouer
 * un code pourtant valide — panne invisible et pénible à diagnostiquer.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Adresse e-mail invalide.")
  // Limite de la RFC 5321 : au-delà, aucun serveur de messagerie ne l'accepte.
  .max(254, "Adresse e-mail trop longue.");

/**
 * Code à usage unique.
 *
 * Les caractères non numériques sont retirés avant validation : un code copié
 * depuis un client mail arrive régulièrement avec une espace ou un tiret, et
 * l'utilisateur n'a pas à payer la mise en forme de sa boîte de réception.
 */
export const otpCodeSchema = z
  .string()
  .transform((raw) => raw.replace(/\D/g, ""))
  .pipe(
    z
      .string()
      .length(OTP_CODE_LENGTH, `Le code de connexion contient ${OTP_CODE_LENGTH} chiffres.`),
  );

/** Étape 1 — demande d'un code. */
export const requestCodeSchema = z.object({ email: emailSchema });
export type RequestCodeInput = z.infer<typeof requestCodeSchema>;

/** Étape 2 — vérification du code saisi. */
export const verifyCodeSchema = z.object({ email: emailSchema, code: otpCodeSchema });
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;

/** Forme canonique d'une adresse, ou `null` si elle n'est pas exploitable. */
export function normalizeEmail(value: string): string | null {
  const result = emailSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * Chiffres saisis, tronqués à la longueur attendue.
 *
 * Sert à piloter l'affichage du champ pendant la frappe : le champ ne doit
 * jamais montrer autre chose que ce qui sera effectivement vérifié.
 */
export function normalizeOtpCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, OTP_CODE_LENGTH);
}

/** L'adresse est-elle exploitable ? Pilote l'activation du bouton d'envoi. */
export function isValidEmail(value: string): boolean {
  return emailSchema.safeParse(value).success;
}

/** Le code est-il complet ? Pilote l'activation du bouton de connexion. */
export function isCompleteOtpCode(value: string): boolean {
  return otpCodeSchema.safeParse(value).success;
}
