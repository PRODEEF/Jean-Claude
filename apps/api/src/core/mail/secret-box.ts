import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Chiffre un secret avant son écriture en base (AES-256-GCM).
 *
 * Le mot de passe d'une boîte mail doit pouvoir être relu par le serveur pour
 * se connecter : un hachage ne convient pas. Chiffré avec une clé qui ne vit
 * que dans l'environnement du serveur, il ne sert à rien à qui lirait la base.
 */

const KEY_BYTES = 32;
const IV_BYTES = 12;

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error("MAIL_ENCRYPTION_KEY doit être une clé de 32 octets en base 64.");
  }
  return key;
}

/** Forme stockée : `iv.étiquette.texte`, chaque part en base 64. */
export function encryptSecret(plain: string, base64Key: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(base64Key), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64")).join(".");
}

export function decryptSecret(stored: string, base64Key: string): string {
  const [iv, tag, body] = stored.split(".").map((part) => Buffer.from(part, "base64"));
  if (!iv || !tag || !body) throw new Error("Secret chiffré illisible.");

  const decipher = createDecipheriv("aes-256-gcm", keyFrom(base64Key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
