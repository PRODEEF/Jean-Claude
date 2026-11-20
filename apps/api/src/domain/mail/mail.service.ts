import type {
  ConnectMailAccount,
  MailAccount,
  MailFolder,
  MailInbox,
  MailMessage,
  MailMessageSummary,
} from "@jc/domain";
import { INBOX_PATH, MAIL_ATTACHMENT_MAX_BYTES, MAX_MAIL_ACCOUNTS } from "@jc/domain";
import { httpError } from "../../core/http.js";
import { logger } from "../../core/logger.js";
import type {
  IMailbox,
  MailboxAttachment,
  MailboxCredentials,
  MailboxListOptions,
} from "../../core/mail/mailbox.js";
import { decryptSecret, encryptSecret } from "../../core/mail/secret-box.js";
import type { IMailRepository, StoredMailAccount } from "./mail.repository.interface.js";

const SCOPE = "mail.service";

/**
 * Boîtes mail de l'utilisateur : dossiers, liste, lecture.
 *
 * Le mot de passe n'est lu que par le serveur, le temps d'un appel : il entre
 * en clair ici, repart chiffré vers la base, et aucune réponse ne le renvoie.
 */
export class MailService {
  constructor(
    private readonly accounts: IMailRepository,
    private readonly mailbox: IMailbox,
    /** Clé de chiffrement ; vide = messagerie désactivée côté serveur. */
    private readonly encryptionKey: string,
  ) {}

  async listAccounts(userId: string, accessToken: string): Promise<MailAccount[]> {
    const stored = await this.accounts.list(userId, accessToken);
    return stored.map(({ passwordEncrypted: _hidden, ...account }) => account);
  }

  async connect(
    userId: string,
    input: ConnectMailAccount,
    accessToken: string,
  ): Promise<MailAccount> {
    if (!this.encryptionKey) {
      throw httpError(503, "La messagerie n'est pas encore activée sur le serveur.");
    }

    // Relier à nouveau une adresse déjà reliée remplace son mot de passe : elle
    // ne compte pas pour une boîte de plus.
    const existing = await this.accounts.list(userId, accessToken);
    const known = existing.some((account) => account.address === input.address);
    if (!known && existing.length >= MAX_MAIL_ACCOUNTS) {
      throw httpError(400, `Vous pouvez relier ${MAX_MAIL_ACCOUNTS} boîtes au plus.`);
    }

    // Vérifié avant d'être gardé : un mot de passe faux ne doit pas être
    // enregistré pour échouer plus tard, à chaque lecture.
    try {
      await this.mailbox.verify({
        host: input.host,
        address: input.address,
        password: input.password,
      });
    } catch (error) {
      // Le message du serveur de courrier reste dans les journaux : il peut citer l'adresse.
      logger.warn(
        SCOPE,
        "Connexion à la boîte refusée.",
        error instanceof Error ? error.message : error,
      );
      throw httpError(
        400,
        "Connexion refusée : vérifiez l'adresse, le mot de passe et le serveur.",
      );
    }

    return this.accounts.save(
      userId,
      {
        address: input.address,
        host: input.host,
        passwordEncrypted: encryptSecret(input.password, this.encryptionKey),
      },
      accessToken,
    );
  }

  async disconnect(userId: string, accountId: string, accessToken: string): Promise<void> {
    await this.accounts.remove(userId, accountId, accessToken);
  }

  async listFolders(userId: string, accountId: string, accessToken: string): Promise<MailFolder[]> {
    const credentials = this.credentialsOf(await this.accountOf(userId, accountId, accessToken));
    try {
      return await this.mailbox.listFolders(credentials);
    } catch (error) {
      throw this.unreachable(error);
    }
  }

  async listMessages(
    userId: string,
    accountId: string,
    folder: string,
    options: MailboxListOptions,
    accessToken: string,
  ): Promise<MailMessageSummary[]> {
    const credentials = this.credentialsOf(await this.accountOf(userId, accountId, accessToken));
    try {
      const messages = await this.mailbox.listMessages(credentials, folder, options);
      return messages.map((message) => ({ ...message, accountId }));
    } catch (error) {
      throw this.unreachable(error);
    }
  }

  /**
   * Boîtes de réception de toutes les boîtes, réunies, les plus récents d'abord.
   *
   * Une boîte qui ne répond pas ne cache pas les autres : elle est signalée,
   * et le reste s'affiche.
   */
  async listAllInbox(
    userId: string,
    options: MailboxListOptions,
    accessToken: string,
  ): Promise<MailInbox> {
    const accounts = await this.accounts.list(userId, accessToken);
    if (accounts.length > 0 && !this.encryptionKey) {
      throw httpError(503, "La messagerie n'est pas encore activée sur le serveur.");
    }

    const results = await Promise.allSettled(
      accounts.map(async (account) => {
        const messages = await this.mailbox.listMessages(
          this.credentialsOf(account),
          INBOX_PATH,
          options,
        );
        return messages.map((message) => ({ ...message, accountId: account.id }));
      }),
    );

    const messages: MailMessageSummary[] = [];
    const unreachableAccountIds: string[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        messages.push(...result.value);
        return;
      }
      logger.warn(
        SCOPE,
        "Boîte injoignable dans la boîte de réception commune.",
        result.reason instanceof Error ? result.reason.message : result.reason,
      );
      const account = accounts[index];
      if (account) unreachableAccountIds.push(account.id);
    });

    // Sans date, un mail passe après tous les autres : on ne sait pas où le ranger.
    const timeOf = (message: MailMessageSummary) =>
      message.date ? new Date(message.date).getTime() : 0;
    messages.sort((a, b) => timeOf(b) - timeOf(a));

    return { messages: messages.slice(0, options.limit), unreachableAccountIds };
  }

  async readMessage(
    userId: string,
    accountId: string,
    folder: string,
    uid: number,
    accessToken: string,
  ): Promise<MailMessage> {
    const credentials = this.credentialsOf(await this.accountOf(userId, accountId, accessToken));
    let message;
    try {
      message = await this.mailbox.readMessage(credentials, folder, uid);
    } catch (error) {
      throw this.unreachable(error);
    }
    if (!message) throw httpError(404, "Message introuvable.");
    return { ...message, accountId };
  }

  /** Une pièce jointe, prête à être renvoyée au client. */
  async getAttachment(
    userId: string,
    accountId: string,
    folder: string,
    uid: number,
    index: number,
    accessToken: string,
  ): Promise<MailboxAttachment> {
    const credentials = this.credentialsOf(await this.accountOf(userId, accountId, accessToken));
    let attachment: MailboxAttachment | null;
    try {
      attachment = await this.mailbox.getAttachment(credentials, folder, uid, index);
    } catch (error) {
      throw this.unreachable(error);
    }
    if (!attachment) throw httpError(404, "Pièce jointe introuvable.");
    // Au-delà, l'hébergement ne laisse pas passer la réponse : mieux vaut le dire.
    if (attachment.content.length > MAIL_ATTACHMENT_MAX_BYTES) {
      throw httpError(
        413,
        "Cette pièce jointe est trop volumineuse pour être ouverte ici (4 Mo au plus).",
      );
    }
    return attachment;
  }

  /** Marque un mail lu ou non lu chez le fournisseur. */
  async setSeen(
    userId: string,
    accountId: string,
    folder: string,
    uid: number,
    seen: boolean,
    accessToken: string,
  ): Promise<void> {
    const credentials = this.credentialsOf(await this.accountOf(userId, accountId, accessToken));
    try {
      await this.mailbox.setSeen(credentials, folder, uid, seen);
    } catch (error) {
      throw this.unreachable(error);
    }
  }

  private async accountOf(
    userId: string,
    accountId: string,
    accessToken: string,
  ): Promise<StoredMailAccount> {
    const stored = await this.accounts.findById(userId, accountId, accessToken);
    if (!stored) throw httpError(404, "Boîte mail introuvable.");
    return stored;
  }

  private credentialsOf(account: StoredMailAccount): MailboxCredentials {
    if (!this.encryptionKey) {
      throw httpError(503, "La messagerie n'est pas encore activée sur le serveur.");
    }
    return {
      host: account.host,
      address: account.address,
      password: decryptSecret(account.passwordEncrypted, this.encryptionKey),
    };
  }

  private unreachable(error: unknown): Error {
    logger.warn(
      SCOPE,
      "Lecture de la boîte en échec.",
      error instanceof Error ? error.message : error,
    );
    return httpError(502, "La boîte mail ne répond pas. Réessayez dans un instant.");
  }
}
