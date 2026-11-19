import type { MailAccount } from "@jc/domain";

/** Boîte reliée avec son mot de passe chiffré — ne sort jamais du serveur. */
export type StoredMailAccount = MailAccount & { passwordEncrypted: string };

export interface IMailRepository {
  /** `null` quand l'utilisateur n'a relié aucune boîte. */
  find(userId: string, accessToken: string): Promise<StoredMailAccount | null>;
  /** Remplace la boîte déjà reliée : une seule par personne. */
  save(
    userId: string,
    input: { address: string; host: string; passwordEncrypted: string },
    accessToken: string,
  ): Promise<MailAccount>;
  remove(userId: string, accessToken: string): Promise<void>;
}
