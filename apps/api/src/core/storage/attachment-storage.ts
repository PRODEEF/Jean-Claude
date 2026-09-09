import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageAttachmentMimeType } from "@jc/domain";
import { logger } from "../logger.js";
import type { Database } from "../supabase/database.types.js";

const SCOPE = "core.storage.attachment-storage";

export const ATTACHMENT_BUCKET = "message-attachments";

/**
 * Durée de vie d'une URL signée.
 *
 * Assez large pour couvrir l'aperçu immédiat côté client et l'appel au
 * modèle qui suit dans la foulée, assez court pour qu'une URL qui fuiterait
 * (log, cache intermédiaire) cesse vite de donner accès à l'image.
 */
const ATTACHMENT_URL_TTL_SECONDS = 600;

const EXTENSION_BY_MIME: Record<MessageAttachmentMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
};

/**
 * Chemin Storage d'une pièce jointe : `{userId}/{attachmentId}.{ext}`.
 *
 * Le premier segment est ce que lisent les policies RLS de
 * `storage.objects` (`(storage.foldername(name))[1] = auth.uid()`) — aucune
 * jointure vers `message_attachments` n'est nécessaire, le chemin porte déjà
 * l'identité du propriétaire.
 */
export function attachmentPath(
  userId: string,
  attachmentId: string,
  mimeType: MessageAttachmentMimeType,
): string {
  return `${userId}/${attachmentId}.${EXTENSION_BY_MIME[mimeType]}`;
}

/** URL signée à courte durée de vie pour une pièce jointe. */
export async function signAttachmentUrl(
  client: SupabaseClient<Database>,
  path: string,
): Promise<string> {
  const { data, error } = await client.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(path, ATTACHMENT_URL_TTL_SECONDS);

  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/**
 * URLs signées pour un lot de pièces jointes, en un seul aller-retour.
 *
 * Appelée avec les chemins de toute une page de messages plutôt qu'une fois
 * par pièce jointe — signer une par une aurait multiplié les requêtes
 * Storage par le nombre de pièces jointes de la page.
 */
export async function signAttachmentUrls(
  client: SupabaseClient<Database>,
  paths: string[],
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();

  const { data, error } = await client.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrls(paths, ATTACHMENT_URL_TTL_SECONDS);

  if (error) throw new Error(error.message);

  const urls = new Map<string, string>();
  for (const entry of data) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}

/**
 * Supprime les objets Storage correspondants.
 *
 * Best-effort, journalisée plutôt que propagée : appelée juste avant une
 * suppression SQL déjà décidée (compte, conversation, message), elle ne doit
 * pas empêcher cette suppression si Storage est momentanément indisponible —
 * la ligne Postgres disparaît de toute façon, et un objet orphelin restant
 * est une dette de propreté, pas une fuite (RLS le rend inaccessible dès que
 * son propriétaire n'a plus de session).
 */
export async function removeAttachmentObjects(
  client: SupabaseClient<Database>,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;

  const { error } = await client.storage.from(ATTACHMENT_BUCKET).remove(paths);
  if (error) logger.error(SCOPE, "Échec de la suppression d'objets Storage", error.message);
}
