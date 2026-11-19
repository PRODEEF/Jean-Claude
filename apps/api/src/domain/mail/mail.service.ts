import type { ConnectMailAccount, MailAccount, MailMessage, MailMessageSummary } from "@jc/domain";
import { MAIL_PAGE_SIZE } from "@jc/domain";
import { httpError } from "../../core/http.js";
import { logger } from "../../core/logger.js";
import type { IMailbox, MailboxCredentials } from "../../core/mail/mailbox.js";
import { decryptSecret, encryptSecret } from "../../core/mail/secret-box.js";
import type { IMailRepository } from "./mail.repository.interface.js";

const SCOPE = "mail.service";

/**
 * Boîte mail de l'utilisateur, en lecture seule (étape 1 de la messagerie).
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

  async getAccount(userId: string, accessToken: string): Promise<MailAccount | null> {
    const stored = await this.accounts.find(userId, accessToken);
    if (!stored) return null;

    const { passwordEncrypted: _hidden, ...account } = stored;
    return account;
  }

  async connect(
    userId: string,
    input: ConnectMailAccount,
    accessToken: string,
  ): Promise<MailAccount> {
    if (!this.encryptionKey) {
      throw httpError(503, "La messagerie n'est pas encore activée sur le serveur.");
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

  async disconnect(userId: string, accessToken: string): Promise<void> {
    await this.accounts.remove(userId, accessToken);
  }

  async listMessages(userId: string, accessToken: string): Promise<MailMessageSummary[]> {
    const credentials = await this.credentialsOf(userId, accessToken);
    try {
      return await this.mailbox.listInbox(credentials, MAIL_PAGE_SIZE);
    } catch (error) {
      throw this.unreachable(error);
    }
  }

  async readMessage(userId: string, uid: number, accessToken: string): Promise<MailMessage> {
    const credentials = await this.credentialsOf(userId, accessToken);
    let message: MailMessage | null;
    try {
      message = await this.mailbox.readMessage(credentials, uid);
    } catch (error) {
      throw this.unreachable(error);
    }
    if (!message) throw httpError(404, "Message introuvable.");
    return message;
  }

  private async credentialsOf(userId: string, accessToken: string): Promise<MailboxCredentials> {
    if (!this.encryptionKey) {
      throw httpError(503, "La messagerie n'est pas encore activée sur le serveur.");
    }
    const stored = await this.accounts.find(userId, accessToken);
    if (!stored) throw httpError(404, "Aucune boîte mail n'est reliée.");

    return {
      host: stored.host,
      address: stored.address,
      password: decryptSecret(stored.passwordEncrypted, this.encryptionKey),
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
