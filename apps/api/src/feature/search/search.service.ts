import type { Paginated, SearchFilters, SearchResult } from "@jc/domain";
import type { IUserRepository } from "../../domain/user/user.repository.interface.js";
import { resolveDateRange } from "./date-range.js";
import type { ISearchRepository } from "./search.repository.interface.js";

/** Longueur de l'extrait rendu autour du passage trouvé. */
const EXCERPT_LENGTH = 160;

const EMPTY: Paginated<SearchResult> = { items: [], nextCursor: null };

/**
 * Recherche par filtres (A.6).
 *
 * Le mot-clé porte à la fois sur les titres et sur le contenu des messages :
 * on retrouve un fil dont on ne se rappelle plus le nom. Les deux plein textes
 * sont menés de front, puis croisés avec les filtres de dossier et de date.
 */
export class SearchService {
  constructor(
    private readonly repository: ISearchRepository,
    private readonly users: IUserRepository,
  ) {}

  async search(
    userId: string,
    accessToken: string,
    filters: SearchFilters & { cursor?: string | undefined },
  ): Promise<Paginated<SearchResult>> {
    const range = await this.resolveRange(userId, accessToken, filters);

    // `undefined` et non un tableau vide : « aucune restriction » et « aucune
    // conversation ne convient » mènent à des résultats opposés.
    let ids: string[] | undefined;

    if (filters.folderIds && filters.folderIds.length > 0) {
      ids = await this.repository.findIdsInFolders(filters.folderIds, accessToken);
      if (ids.length === 0) return EMPTY;
    }

    const excerpts = new Map<string, string>();
    const keyword = filters.query?.trim();

    if (keyword) {
      const [titleIds, matches] = await Promise.all([
        this.repository.findIdsByTitle(keyword, accessToken),
        this.repository.findMessageMatches(keyword, accessToken),
      ]);

      for (const match of matches) {
        // Les messages arrivent du plus récent au plus ancien : le premier vu
        // pour une conversation est celui qu'on montre.
        if (!excerpts.has(match.conversationId)) {
          excerpts.set(match.conversationId, excerpt(match.content, keyword));
        }
      }

      const matched = new Set([...titleIds, ...excerpts.keys()]);
      ids = ids ? ids.filter((id) => matched.has(id)) : [...matched];
      if (ids.length === 0) return EMPTY;
    }

    const page = await this.repository.findConversations(
      {
        ...(ids ? { ids } : {}),
        ...(range.from ? { from: range.from } : {}),
        ...(range.to ? { to: range.to } : {}),
        ...(filters.cursor ? { cursor: filters.cursor } : {}),
        includeArchived: filters.includeArchived,
        limit: filters.limit,
      },
      accessToken,
    );

    return {
      items: page.items.map((conversation) => ({
        conversation,
        excerpt: excerpts.get(conversation.id) ?? null,
      })),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * Le fuseau n'est lu qu'en présence d'un filtre de date : sans lui, la
   * recherche coûterait une requête de profil à chaque frappe.
   */
  private async resolveRange(
    userId: string,
    accessToken: string,
    filters: SearchFilters,
  ): Promise<{ from?: string; to?: string }> {
    if (!filters.shortcut && !filters.from && !filters.to) return {};

    const profile = await this.users.findById(userId, accessToken);
    return resolveDateRange(filters, profile?.preferences.timezone ?? "Europe/Paris");
  }
}

/**
 * Passage du message autour du mot recherché.
 *
 * Le premier mot du terme suffit à viser : les autres, s'ils sont là, sont
 * dans la même phrase. À défaut de correspondance littérale — le plein texte
 * ayant retenu le message sur une forme lemmatisée ou désaccentuée — on rend
 * le début du message, qui reste plus parlant qu'un extrait vide.
 */
function excerpt(content: string, keyword: string): string {
  const normalized = normalize(content);
  const term = normalize(keyword).split(/\s+/)[0] ?? "";
  const found = term.length > 0 ? normalized.indexOf(term) : -1;

  if (found === -1) return truncate(content, 0);

  // On recule d'un tiers d'extrait pour garder ce qui précède le mot trouvé :
  // un extrait qui commence pile dessus se lit hors contexte.
  return truncate(content, Math.max(0, found - Math.floor(EXCERPT_LENGTH / 3)));
}

function truncate(content: string, start: number): string {
  const slice = content.slice(start, start + EXCERPT_LENGTH).trim();
  const prefix = start > 0 ? "…" : "";
  const suffix = start + EXCERPT_LENGTH < content.length ? "…" : "";
  return `${prefix}${slice}${suffix}`;
}

/** Minuscules et accents retirés — « sante » doit viser « santé ». */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
