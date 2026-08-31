import { Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import type { CreateFolder, Folder, UpdateFolder } from "@jc/domain";
import { SupabaseService } from "../../core/supabase/supabase.service";
import type { IFolderRepository } from "./folder.repository.interface";

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
 * contrôleurs et clients ne manipulent que les types de `@jc/domain`.
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

@Injectable()
export class FolderRepository implements IFolderRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(accessToken: string): Promise<Folder[]> {
    const { data, error } = await this.supabase
      .forUser(accessToken)
      .from("folders")
      .select(COLUMNS)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);
    return (data as unknown as FolderRow[]).map(toEntity);
  }

  async findById(id: string, accessToken: string): Promise<Folder | null> {
    const { data, error } = await this.supabase
      .forUser(accessToken)
      .from("folders")
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    return data ? toEntity(data as unknown as FolderRow) : null;
  }

  async create(userId: string, input: CreateFolder, accessToken: string): Promise<Folder> {
    const { data, error } = await this.supabase
      .forUser(accessToken)
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

    if (error) throw new InternalServerErrorException(error.message);
    return toEntity(data as unknown as FolderRow);
  }

  async update(id: string, patch: UpdateFolder, accessToken: string): Promise<Folder> {
    // Un `undefined` doit laisser la colonne intacte ; un `null` explicite doit
    // l'effacer. On ne construit donc le payload qu'à partir des clés fournies.
    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload["name"] = patch.name;
    if (patch.parentId !== undefined) payload["parent_id"] = patch.parentId;
    if (patch.category !== undefined) payload["category"] = patch.category;
    if (patch.purpose !== undefined) payload["purpose"] = patch.purpose;
    if (patch.color !== undefined) payload["color"] = patch.color;
    if (patch.position !== undefined) payload["position"] = patch.position;

    const { data, error } = await this.supabase
      .forUser(accessToken)
      .from("folders")
      .update(payload)
      .eq("id", id)
      .select(COLUMNS)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException("Dossier introuvable.");
    return toEntity(data as unknown as FolderRow);
  }

  async delete(id: string, accessToken: string): Promise<void> {
    const { error } = await this.supabase
      .forUser(accessToken)
      .from("folders")
      .delete()
      .eq("id", id);

    if (error) throw new InternalServerErrorException(error.message);
  }

  async countConversations(accessToken: string): Promise<Map<string, number>> {
    const { data, error } = await this.supabase
      .forUser(accessToken)
      .from("conversation_folders")
      .select("folder_id");

    if (error) throw new InternalServerErrorException(error.message);

    const counts = new Map<string, number>();
    for (const row of data as unknown as { folder_id: string }[]) {
      counts.set(row.folder_id, (counts.get(row.folder_id) ?? 0) + 1);
    }
    return counts;
  }
}
