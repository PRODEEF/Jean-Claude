import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "../shared/primitives";

/** Serveur OVH par défaut (MX Plan, Email Pro) : celui qu'utilise la plupart des boîtes. */
export const DEFAULT_MAIL_HOST = "ssl0.ovh.net";

/**
 * Un serveur de courrier d'OVH, et lui seul : le serveur de Jean-Claude s'y
 * connecte à la demande de l'utilisateur, un nom libre le ferait joindre
 * n'importe quelle machine du réseau (§5.3).
 */
export const mailHostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*\.ovh\.net$/, "Serveur OVH attendu (ex. ssl0.ovh.net).");

/** Boîte reliée : jamais le mot de passe, il ne quitte pas le serveur. */
export const mailAccountSchema = z.object({
  id: uuidSchema,
  address: z.string(),
  host: z.string(),
  createdAt: isoDateTimeSchema,
});
export type MailAccount = z.infer<typeof mailAccountSchema>;

export const connectMailAccountSchema = z.object({
  address: z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(200),
  password: z.string().min(1, "Mot de passe requis.").max(200),
  host: mailHostSchema.default(DEFAULT_MAIL_HOST),
});
export type ConnectMailAccount = z.infer<typeof connectMailAccountSchema>;

export const mailMessageSummarySchema = z.object({
  /** Identifiant du message dans la boîte de réception, stable d'une lecture à l'autre. */
  uid: z.number().int().positive(),
  from: z.string(),
  subject: z.string(),
  date: isoDateTimeSchema.nullable(),
  seen: z.boolean(),
});
export type MailMessageSummary = z.infer<typeof mailMessageSummarySchema>;

export const mailMessageSchema = mailMessageSummarySchema.extend({
  to: z.string(),
  /** Texte brut du message ; `null` quand il n'en porte pas (courrier en images seules). */
  text: z.string().nullable(),
});
export type MailMessage = z.infer<typeof mailMessageSchema>;

/** Messages lus d'un coup : les plus récents de la boîte de réception. */
export const MAIL_PAGE_SIZE = 30;
