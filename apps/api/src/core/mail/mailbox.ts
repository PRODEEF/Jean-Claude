import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import type { MailFolder, MailMessage, MailMessageSummary } from "@jc/domain";
import { logger } from "../logger.js";
import { presentFolders } from "./folders.js";
import { previewOf } from "./preview.js";

const SCOPE = "core.mail";

/** Un mail tel que le serveur de courrier le donne : le rattachement à une boîte s'ajoute au-dessus. */
export type MailboxSummary = Omit<MailMessageSummary, "accountId">;
export type MailboxMessage = Omit<MailMessage, "accountId">;

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
  /** Marque un message lu ou non lu chez le fournisseur. */
  setSeen(
    credentials: MailboxCredentials,
    folder: string,
    uid: number,
    seen: boolean,
  ): Promise<void>;
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
        source: { start: 0, maxLength: PREVIEW_BYTES },
      };
      for await (const message of client.fetch(range, query, byUid ? { uid: true } : {})) {
        messages.push({
          uid: message.uid,
          from: message.envelope?.from?.map((a) => a.name || a.address || "").join(", ") ?? "",
          subject: message.envelope?.subject ?? "",
          date: message.envelope?.date ? new Date(message.envelope.date).toISOString() : null,
          seen: message.flags?.has("\\Seen") ?? false,
          preview: await previewFrom(message.source),
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
        return {
          uid: fetched.uid,
          from: formatAddresses(parsed.from),
          to: formatAddresses(parsed.to),
          subject: parsed.subject ?? "",
          date: parsed.date ? parsed.date.toISOString() : null,
          seen: true,
          text: parsed.text?.trim() ? parsed.text : null,
        };
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
};
