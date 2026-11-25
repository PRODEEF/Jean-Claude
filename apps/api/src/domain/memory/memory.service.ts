import { MEMORY_MAX_PER_USER, type Memory } from "@jc/domain";
import { httpError } from "../../core/http.js";
import type { IMemoryRepository } from "./memory.repository.interface.js";

/** « Aime courir »  et « aime courir. » disent la même chose. */
function normalized(content: string): string {
  return content
    .trim()
    .toLowerCase()
    .replace(/[\s.!]+$/u, "");
}

/**
 * Ce que Jean-Claude sait de l'utilisateur.
 *
 * L'assistant n'écrit ici qu'à l'acceptation d'une proposition (§12.1) : le
 * service ne sait pas qui l'appelle, c'est l'appelant qui garantit que le geste
 * a eu lieu.
 */
export class MemoryService {
  constructor(private readonly memories: IMemoryRepository) {}

  list(accessToken: string): Promise<Memory[]> {
    return this.memories.findAll(accessToken);
  }

  /**
   * Retient une chose de plus.
   *
   * Déjà retenue, elle n'est pas dupliquée : l'assistant qui la repropose et
   * reçoit un « oui » ne doit pas encombrer la liste. L'utilisateur qui la
   * saisit à la main en est averti, lui, plutôt que de croire l'avoir ajoutée.
   */
  async add(
    userId: string,
    content: string,
    source: Memory["source"],
    accessToken: string,
  ): Promise<Memory> {
    const known = await this.memories.findAll(accessToken);
    const same = known.find((memory) => normalized(memory.content) === normalized(content));

    if (same) {
      if (source === "user") throw httpError(409, "Jean-Claude le sait déjà.");
      return same;
    }
    if (known.length >= MEMORY_MAX_PER_USER) {
      throw httpError(
        409,
        `Jean-Claude retient déjà ${MEMORY_MAX_PER_USER} choses : supprimez-en une avant d'en ajouter.`,
      );
    }

    return this.memories.create(userId, content.trim(), source, accessToken);
  }

  async update(id: string, content: string, accessToken: string): Promise<Memory> {
    const updated = await this.memories.update(id, content.trim(), accessToken);
    if (!updated) throw httpError(404, "Souvenir introuvable.");
    return updated;
  }

  async delete(id: string, accessToken: string): Promise<void> {
    if (!(await this.memories.delete(id, accessToken))) {
      throw httpError(404, "Souvenir introuvable.");
    }
  }
}
