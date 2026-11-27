/**
 * Comment envoyer un mail depuis la boîte d'un fournisseur : le serveur de
 * réception (IMAP) et celui d'envoi (SMTP) ne sont pas toujours le même.
 */
export type SmtpSettings = {
  host: string;
  port: number;
  /** Connexion chiffrée d'emblée (465) ; sinon elle le devient par STARTTLS (587). */
  secure: boolean;
  /** Le fournisseur range lui-même une copie dans « Envoyés » : en ajouter une la doublerait. */
  savesSentCopy: boolean;
};

/** Le serveur de réception d'une boîte Hotmail / Outlook personnelle. */
export const OUTLOOK_IMAP_HOST = "outlook.office365.com";

/**
 * OVH et Infomaniak envoient par le même serveur, en connexion chiffrée d'emblée,
 * et laissent le client ranger la copie dans « Envoyés ». Hotmail / Outlook envoie
 * par un autre serveur, en STARTTLS, et range la copie lui-même.
 */
export function smtpSettingsFor(imapHost: string): SmtpSettings {
  if (imapHost === OUTLOOK_IMAP_HOST) {
    return { host: "smtp-mail.outlook.com", port: 587, secure: false, savesSentCopy: true };
  }
  return { host: imapHost, port: 465, secure: true, savesSentCopy: false };
}
