import type { MailAccount } from "@jc/domain";

/** Boîte reliée avec son mot de passe chiffré — ne sort jamais du serveur. */
export type StoredMailAccount = MailAccount & { passwordEncrypted: string };

export interface IMailRepository {
  /** Les boîtes de l'utilisateur, les plus anciennement reliées d'abord. */
  list(userId: string, accessToken: string): Promise<StoredMailAccount[]>;
  /** `null` quand la boîte n'existe pas ou n'est pas à l'appelant. */
  findById(userId: string, id: string, accessToken: string): Promise<StoredMailAccount | null>;
  /** Relie une boîte ; relier à nouveau la même adresse remplace son mot de passe. */
  save(
    userId: string,
    input: { address: string; host: string; passwordEncrypted: string },
    accessToken: string,
  ): Promise<MailAccount>;
  remove(userId: string, id: string, accessToken: string): Promise<void>;
}
