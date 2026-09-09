import type { MessageAttachmentMimeType } from "@jc/domain";
import { logger } from "../../core/logger.js";
import {
  ATTACHMENT_BUCKET,
  attachmentPath,
  removeAttachmentObjects,
  signAttachmentUrl,
  signAttachmentUrls,
} from "../../core/storage/attachment-storage.js";
import { forUser } from "../../core/supabase/supabase.js";
import type { AttachmentRecord, IAttachmentRepository } from "./attachment.repository.interface.js";

const SCOPE = "domain.attachment.repository";

/** Ligne Postgres — snake_case, telle que renvoyée par Supabase. */
type AttachmentRow = {
  id: string;
  message_id: string | null;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  file_name: string;
  extracted_text: string | null;
  created_at: string;
};

const COLUMNS =
  "id, message_id, storage_path, mime_type, byte_size, file_name, extracted_text, created_at";

/**
 * Le mapping snake_case ↔ camelCase est confiné ici. `url` n'est pas une
 * colonne : elle est signée à part, jamais dérivée de `storage_path` sans
 * repasser par Storage — le bucket est privé.
 */
function toRecord(row: AttachmentRow, url: string): AttachmentRecord {
  return {
    id: row.id,
    messageId: row.message_id,
    url,
    fileName: row.file_name,
    mimeType: row.mime_type as MessageAttachmentMimeType,
    byteSize: row.byte_size,
    extractedText: row.extracted_text,
    createdAt: row.created_at,
  };
}

export const attachmentRepository: IAttachmentRepository = {
  async create(userId, input, accessToken) {
    const client = forUser(accessToken);
    // Généré ici plutôt que laissé au défaut Postgres : le chemin Storage doit
    // être connu avant l'upload, qui doit lui-même réussir avant l'insertion.
    const id = crypto.randomUUID();
    const path = attachmentPath(userId, id, input.mimeType);

    const { error: uploadError } = await client.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, input.file, { contentType: input.mimeType });
    if (uploadError) throw new Error(uploadError.message);

    const { data, error } = await client
      .from("message_attachments")
      .insert({
        id,
        user_id: userId,
        storage_path: path,
        mime_type: input.mimeType,
        byte_size: input.byteSize,
        file_name: input.fileName,
        extracted_text: input.extractedText,
      })
      .select(COLUMNS)
      .single();

    if (error) {
      // L'objet est déjà dans Storage : sans ce nettoyage, un échec
      // d'insertion laisserait une image orpheline, jamais référencée.
      await removeAttachmentObjects(client, [path]);
      throw new Error(error.message);
    }

    const row = data as unknown as AttachmentRow;
    const url = await signAttachmentUrl(client, row.storage_path);
    return toRecord(row, url);
  },

  async findById(id, accessToken) {
    const client = forUser(accessToken);
    const { data, error } = await client
      .from("message_attachments")
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const row = data as unknown as AttachmentRow;
    const url = await signAttachmentUrl(client, row.storage_path);
    return toRecord(row, url);
  },

  async findByIds(ids, accessToken) {
    if (ids.length === 0) return [];

    const client = forUser(accessToken);
    const { data, error } = await client.from("message_attachments").select(COLUMNS).in("id", ids);
    if (error) throw new Error(error.message);

    const rows = data as unknown as AttachmentRow[];
    const urls = await signAttachmentUrls(
      client,
      rows.map((row) => row.storage_path),
    );

    const records: AttachmentRecord[] = [];
    for (const row of rows) {
      const url = urls.get(row.storage_path);
      // N'arrive qu'en cas d'incohérence de données (objet Storage disparu
      // sans passer par ce Repository) — exclue plutôt que renvoyée avec une
      // URL vide, que le schéma `@jc/domain` refuserait de toute façon.
      if (!url) {
        logger.warn(SCOPE, "Pièce jointe sans URL signée, exclue du résultat", row.id);
        continue;
      }
      records.push(toRecord(row, url));
    }
    return records;
  },

  async linkToMessage(ids, messageId, accessToken) {
    if (ids.length === 0) return;

    const { error } = await forUser(accessToken)
      .from("message_attachments")
      .update({ message_id: messageId })
      .in("id", ids)
      .is("message_id", null);

    if (error) throw new Error(error.message);
  },

  async delete(id, accessToken) {
    const client = forUser(accessToken);
    const { data, error } = await client
      .from("message_attachments")
      .delete()
      .eq("id", id)
      .select("storage_path")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) {
      const row = data as unknown as { storage_path: string };
      await removeAttachmentObjects(client, [row.storage_path]);
    }
  },
};
