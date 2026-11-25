import type { Memory } from "@jc/domain";

export interface IMemoryRepository {
  /** Les souvenirs de l'utilisateur, du plus récent au plus ancien. */
  findAll(accessToken: string): Promise<Memory[]>;
  create(
    userId: string,
    content: string,
    source: Memory["source"],
    accessToken: string,
  ): Promise<Memory>;
  /** `null` si le souvenir n'existe pas, ou n'est pas à l'utilisateur (RLS). */
  update(id: string, content: string, accessToken: string): Promise<Memory | null>;
  /** Faux si rien n'a été supprimé. */
  delete(id: string, accessToken: string): Promise<boolean>;
}
