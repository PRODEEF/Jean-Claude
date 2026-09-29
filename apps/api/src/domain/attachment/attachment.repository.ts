import type { MessageAttachmentMimeType, WorkspaceRole } from "@jc/domain";
import { logger } from "../../core/logger.js";
import {
  ATTACHMENT_BUCKET,
  attachmentPath,
  workspaceAttachmentPath,
  removeAttachmentObjects,
  signAttachmentUrl,
  signAttachmentUrls,
} from "../../core/storage/attachment-storage.js";
import { forUser } from "../../core/supabase/supabase.js";
import type {
  AttachmentRecord,
  IAttachmentRepository,
  WorkspaceFileRecord,
} from "./attachment.repository.interface.js";

const SCOPE = "domain.attachment.repository";

/** Ligne Postgres — snake_case, telle que renvoyée par Supabase. */
type AttachmentRow = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  deleted_at: string | null;
  message_id: string | null;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  file_name: string;
  extracted_text: string | null;
  created_at: string;
};

const COLUMNS =
  "id, user_id, workspace_id, deleted_at, message_id, storage_path, mime_type, byte_size, " +
  "file_name, extracted_text, created_at";

/** Fichier d'espace, avec la conversation où il a été envoyé. */
type WorkspaceFileRow = {
  id: string;
  user_id: string;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  file_name: string;
  created_at: string;
  messages: { conversations: { id: string; title: string } | null } | null;
};

/**
 * Le mapping snake_case ↔ camelCase est confiné ici. `url` n'est pas une
 * colonne : elle est signée à part, jamais dérivée de `storage_path` sans
 * repasser par Storage — le bucket est privé.
 */
function toRecord(row: AttachmentRow, url: string): AttachmentRecord {
  return {
    id: row.id,
    messageId: row.message_id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    deletedAt: row.deleted_at,
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
    const path = input.workspaceId
      ? workspaceAttachmentPath(input.workspaceId, id, input.mimeType)
      : attachmentPath(userId, id, input.mimeType);

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
        workspace_id: input.workspaceId,
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

  async softDelete(id, accessToken) {
    const client = forUser(accessToken);
    // Le texte part avec le fichier : supprimer doit en effacer le contenu.
    const { data, error } = await client
      .from("message_attachments")
      .update({ deleted_at: new Date().toISOString(), extracted_text: null })
      .eq("id", id)
      .is("deleted_at", null)
      .select("storage_path")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) {
      const row = data as unknown as { storage_path: string };
      await removeAttachmentObjects(client, [row.storage_path]);
    }
  },

  async findWorkspaceRole(workspaceId, userId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as { role: WorkspaceRole } | null)?.role ?? null;
  },

  async findWorkspaceFolders(workspaceId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("folders")
      .select("id, parent_id")
      .eq("workspace_id", workspaceId);

    if (error) throw new Error(error.message);
    return (data as { id: string; parent_id: string | null }[]).map((row) => ({
      id: row.id,
      parentId: row.parent_id,
    }));
  },

  async findWorkspaceFiles(workspaceId, options, accessToken) {
    const client = forUser(accessToken);
    // `!inner` : un fichier dont la conversation n'est pas lisible — ou pas
    // rangée dans le dossier demandé — sort du résultat au lieu d'y revenir
    // avec une conversation `null`.
    const conversation = options.folderIds
      ? "conversations!inner(id, title, conversation_folders!inner(folder_id))"
      : "conversations!inner(id, title)";
    let query = client
      .from("message_attachments")
      .select(
        `id, user_id, storage_path, mime_type, byte_size, file_name, created_at, messages!inner(${conversation})`,
      )
      .eq("workspace_id", workspaceId)
      .not("message_id", "is", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(options.limit + 1);

    if (options.folderIds) {
      query = query.in("messages.conversations.conversation_folders.folder_id", options.folderIds);
    }
    if (options.cursor) query = query.lt("created_at", options.cursor);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data as unknown as WorkspaceFileRow[];
    const hasMore = rows.length > options.limit;
    const page = hasMore ? rows.slice(0, options.limit) : rows;
    const urls = await signAttachmentUrls(
      client,
      page.map((row) => row.storage_path),
    );

    const items: WorkspaceFileRecord[] = [];
    for (const row of page) {
      const url = urls.get(row.storage_path);
      const group = row.messages?.conversations;
      if (!url || !group) {
        logger.warn(SCOPE, "Fichier d'espace sans URL signée ou sans conversation, exclu", row.id);
        continue;
      }
      items.push({
        id: row.id,
        url,
        fileName: row.file_name,
        mimeType: row.mime_type as MessageAttachmentMimeType,
        byteSize: row.byte_size,
        authorId: row.user_id,
        groupId: group.id,
        groupTitle: group.title,
        createdAt: row.created_at,
      });
    }

    return {
      items,
      nextCursor: hasMore ? (page[page.length - 1]?.created_at ?? null) : null,
    };
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
