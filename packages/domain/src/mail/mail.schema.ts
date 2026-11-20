import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "../shared/primitives";

/**
 * Fournisseurs de courrier reliables, avec le serveur qu'on propose par défaut.
 * OVH : MX Plan et Email Pro. Infomaniak : serveur de courrier unique.
 */
export const MAIL_PROVIDERS = [
  { id: "ovh", label: "OVH", host: "ssl0.ovh.net" },
  { id: "infomaniak", label: "Infomaniak", host: "mail.infomaniak.com" },
] as const;
export type MailProviderId = (typeof MAIL_PROVIDERS)[number]["id"];

export const DEFAULT_MAIL_HOST = MAIL_PROVIDERS[0].host;

/**
 * Le serveur d'un fournisseur connu, et lui seul : le serveur de Jean-Claude
 * s'y connecte à la demande de l'utilisateur, un nom libre le ferait joindre
 * n'importe quelle machine du réseau (§5.3).
 */
export const mailHostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^([a-z0-9-]+(\.[a-z0-9-]+)*\.ovh\.net|mail\.infomaniak\.com)$/,
    "Serveur OVH (ex. ssl0.ovh.net) ou Infomaniak (mail.infomaniak.com) attendu.",
  );

/** Boîte reliée : jamais le mot de passe, il ne quitte pas le serveur. */
export const mailAccountSchema = z.object({
  id: uuidSchema,
  address: z.string(),
  host: z.string(),
  createdAt: isoDateTimeSchema,
});
export type MailAccount = z.infer<typeof mailAccountSchema>;

/** Au-delà, relier une boîte de plus est refusé : un garde-fou, pas un besoin. */
export const MAX_MAIL_ACCOUNTS = 5;

export const connectMailAccountSchema = z.object({
  address: z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(200),
  password: z.string().min(1, "Mot de passe requis.").max(200),
  host: mailHostSchema.default(DEFAULT_MAIL_HOST),
});
export type ConnectMailAccount = z.infer<typeof connectMailAccountSchema>;

export const mailMessageSummarySchema = z.object({
  /** Boîte à laquelle appartient le mail. */
  accountId: uuidSchema,
  /** Identifiant du message dans son dossier, stable d'une lecture à l'autre. */
  uid: z.number().int().positive(),
  from: z.string(),
  subject: z.string(),
  date: isoDateTimeSchema.nullable(),
  seen: z.boolean(),
  /** Début du texte du mail, sur une ligne : ce que la liste montre sous l'objet. */
  preview: z.string(),
  /** Le mail porte au moins une pièce jointe : la liste y met un trombone. */
  hasAttachments: z.boolean(),
  /** Marqué d'un drapeau (« Indicateur » chez Outlook) : à ne pas oublier. */
  flagged: z.boolean(),
});
export type MailMessageSummary = z.infer<typeof mailMessageSummarySchema>;

/** Pièce jointe d'un mail ouvert, à télécharger par son rang. */
export const mailAttachmentSchema = z.object({
  /** Rang dans le message, à renvoyer tel quel pour la télécharger. */
  index: z.number().int().min(0),
  filename: z.string(),
  contentType: z.string(),
  /** Taille en octets. */
  size: z.number().int().min(0),
});
export type MailAttachment = z.infer<typeof mailAttachmentSchema>;

/** Au-delà, la réponse du serveur dépasse ce que l'hébergement laisse passer. */
export const MAIL_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;

// L'aperçu et le trombone n'ont de sens que dans la liste : le message lu porte tout son contenu.
export const mailMessageSchema = mailMessageSummarySchema
  .omit({ preview: true, hasAttachments: true })
  .extend({
    to: z.string(),
    /** Texte brut du message ; `null` quand il n'en porte pas (courrier en images seules). */
    text: z.string().nullable(),
    /** Mise en forme du message, déjà nettoyée par le serveur ; `null` pour un mail en texte seul. */
    html: z.string().nullable(),
    attachments: z.array(mailAttachmentSchema),
  });
export type MailMessage = z.infer<typeof mailMessageSchema>;

/** Dossier de la boîte (Boîte de réception, Envoyés…) : `name` est déjà celui qu'on affiche. */
export const mailFolderSchema = z.object({
  /** Chemin chez le serveur de courrier, à renvoyer tel quel pour ouvrir le dossier. */
  path: z.string(),
  name: z.string(),
  /** Niveau d'emboîtement : 0 à la racine, 1 pour un sous-dossier… */
  depth: z.number().int().min(0),
  /** Mails non lus du dossier. */
  unseen: z.number().int().min(0),
});
export type MailFolder = z.infer<typeof mailFolderSchema>;

export const INBOX_PATH = "INBOX";

/** Mails montrés d'un coup, et plafond quand on demande « plus ». */
export const MAIL_PAGE_SIZE = 30;
export const MAIL_MAX_LIMIT = 200;

export const mailFolderQuerySchema = z.object({
  folder: z.string().trim().min(1).max(200).default(INBOX_PATH),
});
export type MailFolderQuery = z.infer<typeof mailFolderQuerySchema>;

/**
 * Ce qu'on demande d'une liste de mails : combien, quoi chercher, et si l'on
 * ne veut que les non lus. `unseen` s'écrit « true » dans l'adresse.
 */
export const mailListQuerySchema = mailFolderQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(MAIL_MAX_LIMIT).default(MAIL_PAGE_SIZE),
  q: z.string().trim().max(100).optional(),
  unseen: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});
export type MailListQuery = z.infer<typeof mailListQuerySchema>;

/** Même demande sans dossier : la boîte de réception commune lit toujours les boîtes de réception. */
export const mailInboxQuerySchema = mailListQuerySchema.omit({ folder: true });

export const setMailSeenSchema = z.object({ seen: z.boolean() });
export type SetMailSeen = z.infer<typeof setMailSeenSchema>;

export const setMailFlagSchema = z.object({ flagged: z.boolean() });
export type SetMailFlag = z.infer<typeof setMailFlagSchema>;

/**
 * Où va un mail qu'on déplace : la corbeille, les archives, ou un dossier au
 * choix. « Supprimer » est « aller à la corbeille » : un mail n'est jamais
 * effacé pour de bon d'ici, une erreur se rattrape en le sortant de la corbeille.
 */
export const moveMailSchema = z.discriminatedUnion("to", [
  z.object({ to: z.literal("trash") }),
  z.object({ to: z.literal("archive") }),
  z.object({ to: z.literal("folder"), folder: z.string().trim().min(1).max(200) }),
]);
export type MoveMail = z.infer<typeof moveMailSchema>;

/**
 * Boîte de réception de toutes les boîtes réunies, les plus récents d'abord.
 * Une boîte qui ne répond pas n'empêche pas de lire les autres : elle est
 * signalée à part.
 */
export const mailInboxSchema = z.object({
  messages: z.array(mailMessageSummarySchema),
  unreachableAccountIds: z.array(uuidSchema),
});
export type MailInbox = z.infer<typeof mailInboxSchema>;
