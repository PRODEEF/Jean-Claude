import type { Memory } from "@jc/domain";
import { forUser } from "../../core/supabase/supabase.js";
import type { IMemoryRepository } from "./memory.repository.interface.js";

/** Ligne Postgres — snake_case, telle que renvoyée par Supabase. */
type MemoryRow = {
  id: string;
  content: string;
  source: string;
  created_at: string;
  updated_at: string;
};

const COLUMNS = "id, content, source, created_at, updated_at";

function toEntity(row: MemoryRow): Memory {
  return {
    id: row.id,
    content: row.content,
    source: row.source === "user" ? "user" : "assistant",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const memoryRepository: IMemoryRepository = {
  async findAll(accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("user_memories")
      .select(COLUMNS)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data as unknown as MemoryRow[]).map(toEntity);
  },

  async create(userId, content, source, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("user_memories")
      .insert({ user_id: userId, content, source })
      .select(COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return toEntity(data as unknown as MemoryRow);
  },

  async update(id, content, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("user_memories")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toEntity(data as unknown as MemoryRow) : null;
  },

  async delete(id, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("user_memories")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
  },
};
