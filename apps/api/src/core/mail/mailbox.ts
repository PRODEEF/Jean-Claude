import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import type { MailFolder, MailMessage, MailMessageSummary } from "@jc/domain";
import { logger } from "../logger.js";
import { presentFolders } from "./folders.js";

const SCOPE = "core.mail";

/** Ce qu'il faut pour ouvrir la boîte : le mot de passe est ici en clair, le temps d'un appel. */
export type MailboxCredentials = { host: string; address: string; password: string };

/**
 * Lecture d'une boîte de réception, en lecture seule.
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
    limit: number,
  ): Promise<MailMessageSummary[]>;
  /** `null` quand le message n'existe plus. */
  readMessage(
    credentials: MailboxCredentials,
    folder: string,
    uid: number,
  ): Promise<MailMessage | null>;
}

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
): Promise<T> {
  const client = connect(credentials);
  await client.connect();
  try {
    // Lecture seule : ouvrir la boîte ne doit rien changer, ni marquer lu.
    const lock = await client.getMailboxLock(folder, { readOnly: true });
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
      const folders = await client.list();
      return presentFolders(
        folders.map((entry) => ({
          path: entry.path,
          name: entry.name,
          specialUse: entry.specialUse,
          delimiter: entry.delimiter,
          selectable: !entry.flags.has("\\Noselect"),
        })),
      );
    } finally {
      await client.logout().catch((error: unknown) => {
        logger.warn(SCOPE, "Fermeture de la connexion en échec.", error);
      });
    }
  },

  async listMessages(credentials, folder, limit) {
    return withFolder(credentials, folder, async (client) => {
      const total = client.mailbox && client.mailbox.exists ? client.mailbox.exists : 0;
      if (total === 0) return [];

      const messages: MailMessageSummary[] = [];
      const range = `${Math.max(1, total - limit + 1)}:*`;
      for await (const message of client.fetch(range, { uid: true, envelope: true, flags: true })) {
        messages.push({
          uid: message.uid,
          from: message.envelope?.from?.map((a) => a.name || a.address || "").join(", ") ?? "",
          subject: message.envelope?.subject ?? "",
          date: message.envelope?.date ? new Date(message.envelope.date).toISOString() : null,
          seen: message.flags?.has("\\Seen") ?? false,
        });
      }
      return messages.sort((a, b) => b.uid - a.uid);
    });
  },

  async readMessage(credentials, folder, uid) {
    return withFolder(credentials, folder, async (client) => {
      const fetched = await client.fetchOne(
        String(uid),
        { uid: true, envelope: true, flags: true, source: true },
        { uid: true },
      );
      if (!fetched || !fetched.source) return null;

      const parsed = await simpleParser(fetched.source);
      return {
        uid: fetched.uid,
        from: formatAddresses(parsed.from),
        to: formatAddresses(parsed.to),
        subject: parsed.subject ?? "",
        date: parsed.date ? parsed.date.toISOString() : null,
        seen: fetched.flags?.has("\\Seen") ?? false,
        text: parsed.text?.trim() ? parsed.text : null,
      };
    });
  },
};
