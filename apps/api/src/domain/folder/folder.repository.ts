import type { CreateFolder, Folder, UpdateFolder } from "@jc/domain";
import { httpError } from "../../core/http.js";
import { forUser } from "../../core/supabase/supabase.js";
import type { IFolderRepository } from "./folder.repository.interface.js";

/** Ligne Postgres — snake_case, telle que renvoyée par Supabase. */
type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  category: string | null;
  purpose: string;
  color: string | null;
  position: number;
  created_by_assistant: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Le mapping snake_case ↔ camelCase est confiné ici.
 *
 * Aucune forme `*_id` ne doit franchir la frontière du Repository : services,
 * routes et clients ne manipulent que les types de `@jc/domain`.
 */
function toEntity(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    category: row.category as Folder["category"],
    purpose: row.purpose as Folder["purpose"],
    color: row.color,
    position: row.position,
    createdByAssistant: row.created_by_assistant,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS =
  "id, name, parent_id, category, purpose, color, position, created_by_assistant, created_at, updated_at";

export const folderRepository: IFolderRepository = {
  async findAll(accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("folders")
      .select(COLUMNS)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data as unknown as FolderRow[]).map(toEntity);
  },

  async findById(id, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("folders")
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toEntity(data as unknown as FolderRow) : null;
  },

  async create(userId, input: CreateFolder, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("folders")
      .insert({
        user_id: userId,
        name: input.name,
        parent_id: input.parentId ?? null,
        category: input.category ?? null,
        purpose: input.purpose ?? "generic",
        color: input.color ?? null,
      })
      .select(COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return toEntity(data as unknown as FolderRow);
  },

  async update(id, patch: UpdateFolder, accessToken) {
    // Un `undefined` doit laisser la colonne intacte ; un `null` explicite doit
    // l'effacer. On ne construit donc le payload qu'à partir des clés fournies.
    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload["name"] = patch.name;
    if (patch.parentId !== undefined) payload["parent_id"] = patch.parentId;
    if (patch.category !== undefined) payload["category"] = patch.category;
    if (patch.purpose !== undefined) payload["purpose"] = patch.purpose;
    if (patch.color !== undefined) payload["color"] = patch.color;
    if (patch.position !== undefined) payload["position"] = patch.position;

    const { data, error } = await forUser(accessToken)
      .from("folders")
      .update(payload)
      .eq("id", id)
      .select(COLUMNS)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw httpError(404, "Dossier introuvable.");
    return toEntity(data as unknown as FolderRow);
  },

  async delete(id, accessToken) {
    const { error } = await forUser(accessToken).from("folders").delete().eq("id", id);

    if (error) throw new Error(error.message);
  },

  async countConversations(accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("conversation_folders")
      .select("folder_id");

    if (error) throw new Error(error.message);

    const counts = new Map<string, number>();
    for (const row of data as unknown as { folder_id: string }[]) {
      counts.set(row.folder_id, (counts.get(row.folder_id) ?? 0) + 1);
    }
    return counts;
  },
};
