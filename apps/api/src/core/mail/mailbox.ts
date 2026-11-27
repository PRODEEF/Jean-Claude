import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import nodemailer from "nodemailer";
import type { MailFolder, MailMessage, MailMessageSummary, SendMail } from "@jc/domain";
import { logger } from "../logger.js";
import {
  ARCHIVE_NAMES,
  pickFolder,
  presentFolders,
  SENT_NAMES,
  TRASH_NAMES,
  type RawFolder,
} from "./folders.js";
import { inlineCidImages, sanitizeMailHtml } from "./html.js";
import { previewOf } from "./preview.js";
import { smtpSettingsFor } from "./smtp.js";
import { hasAttachments, type BodyNode } from "./structure.js";

const SCOPE = "core.mail";

/** Un mail tel que le serveur de courrier le donne : le rattachement à une boîte s'ajoute au-dessus. */
export type MailboxSummary = Omit<MailMessageSummary, "accountId">;
export type MailboxMessage = Omit<MailMessage, "accountId">;

/** Où va un mail déplacé : la corbeille, les archives, ou un dossier au choix. */
export type MailboxDestination = "trash" | "archive" | { folder: string };

/**
 * Ce qu'il est advenu d'un déplacement : fait, sans destination dans cette
 * boîte (« aucune corbeille »), ou le mail est déjà là où on l'envoie.
 */
export type MoveOutcome = "moved" | "no-destination" | "already-there";

/** Une pièce jointe, avec son contenu, prête à être renvoyée. */
export type MailboxAttachment = { filename: string; contentType: string; content: Buffer };

/** Ce qu'il faut pour ouvrir la boîte : le mot de passe est ici en clair, le temps d'un appel. */
export type MailboxCredentials = { host: string; address: string; password: string };

/** Ce qu'on demande d'une liste : combien, quoi chercher, et les non lus seulement. */
export type MailboxListOptions = {
  limit: number;
  query?: string | undefined;
  unseenOnly?: boolean;
};

/**
 * Lecture d'une boîte et marquage lu.
 *
 * Interface plutôt que `ImapFlow` partout : le service se teste sans réseau, et
 * un autre fournisseur (Infomaniak, Proton) se branchera derrière le même
 * contrat.
 */
export interface IMailbox {
  /** Lève si l'adresse ou le mot de passe sont refusés, ou si le serveur est injoignable. */
  verify(credentials: MailboxCredentials): Promise<void>;
  listFolders(credentials: MailboxCredentials): Promise<MailFolder[]>;
  /** Les messages les plus récents d'abord. */
  listMessages(
    credentials: MailboxCredentials,
    folder: string,
    options: MailboxListOptions,
  ): Promise<MailboxSummary[]>;
  /** `null` quand le message n'existe plus. */
  readMessage(
    credentials: MailboxCredentials,
    folder: string,
    uid: number,
  ): Promise<MailboxMessage | null>;
  /** `null` quand le message ou la pièce jointe n'existe pas. */
  getAttachment(
    credentials: MailboxCredentials,
    folder: string,
    uid: number,
    index: number,
  ): Promise<MailboxAttachment | null>;
  /** Déplace un message ; jamais d'effacement définitif. */
  move(
    credentials: MailboxCredentials,
    folder: string,
    uid: number,
    destination: MailboxDestination,
  ): Promise<MoveOutcome>;
  /** Pose ou retire le drapeau d'un message. */
  setFlagged(
    credentials: MailboxCredentials,
    folder: string,
    uid: number,
    flagged: boolean,
  ): Promise<void>;
  /** Marque un message lu ou non lu chez le fournisseur. */
  setSeen(
    credentials: MailboxCredentials,
    folder: string,
    uid: number,
    seen: boolean,
  ): Promise<void>;
  /**
   * Envoie le mail par le serveur sortant de la boîte, puis en garde une copie
   * dans « Envoyés ». Lève si l'envoi est refusé ; la copie, elle, est au mieux.
   */
  send(credentials: MailboxCredentials, mail: SendMail): Promise<void>;
}

/**
 * Part du début d'un mail lue pour l'aperçu : assez pour le premier paragraphe,
 * pas assez pour télécharger une pièce jointe par message de la liste.
 */
const PREVIEW_BYTES = 4096;

/** Au-delà, une boîte qui ne répond pas ferait attendre l'écran sans fin. */
const TIMEOUT_MS = 15_000;

function connect(credentials: MailboxCredentials): ImapFlow {
  return new ImapFlow({
    host: credentials.host,
    port: 993,
    secure: true,
    auth: { user: credentials.address, pass: credentials.password },
    logger: false,
    socketTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    connectionTimeout: TIMEOUT_MS,
  });
}

/** Ouvre, travaille, referme — un serveur sans état ne garde pas de connexion entre deux requêtes. */
async function withFolder<T>(
  credentials: MailboxCredentials,
  folder: string,
  work: (client: ImapFlow) => Promise<T>,
  readOnly = true,
): Promise<T> {
  const client = connect(credentials);
  await client.connect();
  try {
    // Lecture seule par défaut : ouvrir la boîte ne doit rien changer. Seuls les
    // gestes qui marquent un mail lu ou non lu l'ouvrent en écriture.
    const lock = await client.getMailboxLock(folder, { readOnly });
    try {
      return await work(client);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch((error: unknown) => {
      logger.warn(SCOPE, "Fermeture de la connexion en échec.", error);
    });
  }
}

function formatAddresses(field: AddressObject | AddressObject[] | undefined): string {
  const objects = Array.isArray(field) ? field : field ? [field] : [];
  return objects.map((object) => object.text).join(", ");
}

/** Les adresses seules, sans les noms : ce que « Répondre » met dans les champs. */
function addressesOf(field: AddressObject | AddressObject[] | undefined): string[] {
  const objects = Array.isArray(field) ? field : field ? [field] : [];
  return objects.flatMap((object) =>
    object.value.flatMap((entry) => (entry.address ? [entry.address.toLowerCase()] : [])),
  );
}

/** Aperçu d'un début de mail ; un texte illisible donne un aperçu vide, pas une liste cassée. */
async function previewFrom(source: Buffer | undefined): Promise<string> {
  if (!source) return "";
  try {
    const parsed = await simpleParser(source);
    return previewOf(parsed.text);
  } catch (error) {
    logger.warn(SCOPE, "Aperçu illisible.", error instanceof Error ? error.message : error);
    return "";
  }
}

export const mailbox: IMailbox = {
  async verify(credentials) {
    const client = connect(credentials);
    await client.connect();
    await client.logout();
  },

  async listFolders(credentials) {
    const client = connect(credentials);
    await client.connect();
    try {
      // Les non lus de chaque dossier : imapflow les demande dossier par dossier
      // quand le serveur ne sait pas les donner d'un coup.
      const folders = await client.list({ statusQuery: { unseen: true } });
      return presentFolders(
        folders.map((entry) => ({
          path: entry.path,
          name: entry.name,
          specialUse: entry.specialUse,
          delimiter: entry.delimiter,
          selectable: !entry.flags.has("\\Noselect"),
          unseen: entry.status?.unseen ?? 0,
        })),
      );
    } finally {
      await client.logout().catch((error: unknown) => {
        logger.warn(SCOPE, "Fermeture de la connexion en échec.", error);
      });
    }
  },

  async listMessages(credentials, folder, options) {
    return withFolder(credentials, folder, async (client) => {
      const total = client.mailbox && client.mailbox.exists ? client.mailbox.exists : 0;
      if (total === 0) return [];

      // Une recherche ou le filtre « non lus » passe par le serveur, qui rend les
      // numéros des mails concernés ; sans rien de tel, on prend les derniers arrivés.
      const filtered = Boolean(options.query) || options.unseenOnly === true;
      let range: string;
      let byUid = false;
      if (filtered) {
        const found = await client.search(
          {
            ...(options.unseenOnly ? { seen: false } : {}),
            ...(options.query
              ? {
                  or: [
                    { from: options.query },
                    { subject: options.query },
                    { body: options.query },
                  ],
                }
              : {}),
          },
          { uid: true },
        );
        const uids = (found || []).sort((a, b) => b - a).slice(0, options.limit);
        if (uids.length === 0) return [];
        range = uids.join(",");
        byUid = true;
      } else {
        range = `${Math.max(1, total - options.limit + 1)}:*`;
      }

      const messages: MailboxSummary[] = [];
      const query = {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
        source: { start: 0, maxLength: PREVIEW_BYTES },
      };
      for await (const message of client.fetch(range, query, byUid ? { uid: true } : {})) {
        messages.push({
          uid: message.uid,
          from: message.envelope?.from?.map((a) => a.name || a.address || "").join(", ") ?? "",
          subject: message.envelope?.subject ?? "",
          date: message.envelope?.date ? new Date(message.envelope.date).toISOString() : null,
          seen: message.flags?.has("\\Seen") ?? false,
          flagged: message.flags?.has("\\Flagged") ?? false,
          preview: await previewFrom(message.source),
          hasAttachments: hasAttachments(message.bodyStructure as BodyNode | undefined),
        });
      }
      return messages.sort((a, b) => b.uid - a.uid);
    });
  },

  async readMessage(credentials, folder, uid) {
    return withFolder(
      credentials,
      folder,
      async (client) => {
        const fetched = await client.fetchOne(
          String(uid),
          { uid: true, envelope: true, flags: true, source: true },
          { uid: true },
        );
        if (!fetched || !fetched.source) return null;

        // Ouvrir un mail le marque lu, comme dans toute messagerie.
        const wasSeen = fetched.flags?.has("\\Seen") ?? false;
        if (!wasSeen) await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });

        const parsed = await simpleParser(fetched.source);
        const images = parsed.attachments.flatMap((attachment) =>
          attachment.cid
            ? [
                {
                  contentId: attachment.cid,
                  contentType: attachment.contentType,
                  content: attachment.content,
                },
              ]
            : [],
        );
        return {
          uid: fetched.uid,
          from: formatAddresses(parsed.from),
          to: formatAddresses(parsed.to),
          subject: parsed.subject ?? "",
          date: parsed.date ? parsed.date.toISOString() : null,
          seen: true,
          flagged: fetched.flags?.has("\\Flagged") ?? false,
          text: parsed.text?.trim() ? parsed.text : null,
          html: parsed.html ? sanitizeMailHtml(inlineCidImages(parsed.html, images)) : null,
          messageId: parsed.messageId ?? null,
          replyTo: addressesOf(parsed.replyTo ?? parsed.from),
          toList: addressesOf(parsed.to),
          ccList: addressesOf(parsed.cc),
          // Une image intégrée au texte n'est pas une pièce jointe à proposer.
          attachments: parsed.attachments.flatMap((attachment, index) =>
            attachment.related
              ? []
              : [
                  {
                    index,
                    filename: attachment.filename ?? `pièce-jointe-${index + 1}`,
                    contentType: attachment.contentType,
                    size: attachment.size,
                  },
                ],
          ),
        };
      },
      false,
    );
  },

  async getAttachment(credentials, folder, uid, index) {
    return withFolder(credentials, folder, async (client) => {
      const fetched = await client.fetchOne(
        String(uid),
        { uid: true, source: true },
        { uid: true },
      );
      if (!fetched || !fetched.source) return null;

      const attachment = (await simpleParser(fetched.source)).attachments[index];
      if (!attachment) return null;
      return {
        filename: attachment.filename ?? `pièce-jointe-${index + 1}`,
        contentType: attachment.contentType,
        content: attachment.content,
      };
    });
  },

  async move(credentials, folder, uid, destination) {
    const client = connect(credentials);
    await client.connect();
    try {
      let target: string | null;
      if (typeof destination === "object") {
        target = destination.folder;
      } else {
        const raw: RawFolder[] = (await client.list()).map((entry) => ({
          path: entry.path,
          name: entry.name,
          specialUse: entry.specialUse,
          unseen: 0,
          selectable: !entry.flags.has("\\Noselect"),
        }));
        target =
          destination === "trash"
            ? pickFolder(raw, "\\Trash", TRASH_NAMES)
            : pickFolder(raw, "\\Archive", ARCHIVE_NAMES);
      }
      if (!target) return "no-destination";
      if (target === folder) return "already-there";

      const lock = await client.getMailboxLock(folder);
      try {
        await client.messageMove(String(uid), target, { uid: true });
      } finally {
        lock.release();
      }
      return "moved";
    } finally {
      await client.logout().catch((error: unknown) => {
        logger.warn(SCOPE, "Fermeture de la connexion en échec.", error);
      });
    }
  },

  async setFlagged(credentials, folder, uid, flagged) {
    await withFolder(
      credentials,
      folder,
      async (client) => {
        const flags = ["\\Flagged"];
        if (flagged) await client.messageFlagsAdd(String(uid), flags, { uid: true });
        else await client.messageFlagsRemove(String(uid), flags, { uid: true });
      },
      false,
    );
  },

  async setSeen(credentials, folder, uid, seen) {
    await withFolder(
      credentials,
      folder,
      async (client) => {
        const flags = ["\\Seen"];
        if (seen) await client.messageFlagsAdd(String(uid), flags, { uid: true });
        else await client.messageFlagsRemove(String(uid), flags, { uid: true });
      },
      false,
    );
  },
  async send(credentials, mail) {
    // Le message est composé une fois : le même texte part par SMTP et se range dans « Envoyés ».
    const composed = await nodemailer
      .createTransport({ streamTransport: true, buffer: true, newline: "unix" })
      .sendMail({
        from: credentials.address,
        to: mail.to,
        cc: mail.cc,
        subject: mail.subject,
        text: mail.text,
        ...(mail.inReplyTo ? { inReplyTo: mail.inReplyTo, references: mail.inReplyTo } : {}),
      });
    if (!Buffer.isBuffer(composed.message)) throw new Error("Message non composé.");
    const raw = composed.message;

    const smtp = smtpSettingsFor(credentials.host);
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      // Sur 587 la connexion démarre en clair : le mot de passe ne doit jamais partir avant le chiffrement.
      requireTLS: !smtp.secure,
      auth: { user: credentials.address, pass: credentials.password },
      socketTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      connectionTimeout: TIMEOUT_MS,
    });
    // Les copies cachées ne figurent pas dans les en-têtes : elles ne passent que par l'enveloppe.
    await transport.sendMail({
      envelope: { from: credentials.address, to: [...mail.to, ...mail.cc, ...mail.bcc] },
      raw,
    });

    // Le fournisseur a déjà rangé sa copie : en ajouter une la doublerait.
    if (smtp.savesSentCopy) return;

    try {
      const client = connect(credentials);
      await client.connect();
      try {
        const folders: RawFolder[] = (await client.list()).map((entry) => ({
          path: entry.path,
          name: entry.name,
          specialUse: entry.specialUse,
          unseen: 0,
          selectable: !entry.flags.has("\\Noselect"),
        }));
        const sent = pickFolder(folders, "\\Sent", SENT_NAMES);
        if (sent) await client.append(sent, raw, ["\\Seen"]);
      } finally {
        await client.logout().catch(() => undefined);
      }
    } catch (error) {
      // Le mail est parti : une copie manquante ne doit pas faire croire à un échec d'envoi.
      logger.warn(
        SCOPE,
        "Copie dans Envoyés impossible.",
        error instanceof Error ? error.message : error,
      );
    }
  },
};
