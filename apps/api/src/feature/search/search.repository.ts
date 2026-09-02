import { forUser } from "../../core/supabase/supabase.js";
import {
  CONVERSATION_COLUMNS,
  toConversation,
  type ConversationRow,
} from "../../domain/conversation/conversation.repository.js";
import type {
  ConversationPageOptions,
  ISearchRepository,
  MessageMatch,
} from "./search.repository.interface.js";

/**
 * Configuration de recherche plein texte posée par la migration
 * `20260902100000_search_french_unaccent` : lemmatisation française et
 * suppression des accents, pour que « sante » trouve « santé ».
 */
const FTS_CONFIG = "french_unaccent";

/**
 * Plafond du nombre de messages correspondants rapatriés.
 *
 * Ils ne servent qu'à désigner des conversations et à en tirer un extrait :
 * au-delà, on ramènerait des milliers de lignes pour n'en afficher qu'une
 * poignée. Les plus récents étant pris en premier, la troncature ne coupe que
 * dans le fond d'archive.
 */
const MESSAGE_MATCH_LIMIT = 200;

export const searchRepository: ISearchRepository = {
  async findIdsInFolders(folderIds, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("conversation_folders")
      .select("conversation_id")
      .in("folder_id", folderIds);

    if (error) throw new Error(error.message);

    const rows = data as unknown as { conversation_id: string }[];
    return [...new Set(rows.map((row) => row.conversation_id))];
  },

  async findIdsByTitle(keyword, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("conversations")
      .select("id")
      .textSearch("title", keyword, { type: "websearch", config: FTS_CONFIG });

    if (error) throw new Error(error.message);
    return (data as unknown as { id: string }[]).map((row) => row.id);
  },

  async findMessageMatches(keyword, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("messages")
      .select("conversation_id, content")
      .textSearch("content", keyword, { type: "websearch", config: FTS_CONFIG })
      .order("created_at", { ascending: false })
      .limit(MESSAGE_MATCH_LIMIT);

    if (error) throw new Error(error.message);

    const rows = data as unknown as { conversation_id: string; content: string }[];
    return rows.map(
      (row): MessageMatch => ({ conversationId: row.conversation_id, content: row.content }),
    );
  },

  async findConversations(options: ConversationPageOptions, accessToken) {
    let query = forUser(accessToken)
      .from("conversations")
      .select(CONVERSATION_COLUMNS)
      // Le canal permanent est exclu, comme il l'est de la liste latérale :
      // il n'est pas rangeable et se rejoint par son propre bouton (A.10).
      .eq("kind", "chat")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      // Une ligne de plus que demandé : le surplus signale qu'il reste des
      // résultats, sans requête `count` supplémentaire.
      .limit(options.limit + 1);

    if (options.ids) query = query.in("id", options.ids);
    if (!options.includeArchived) query = query.is("archived_at", null);
    if (options.from) query = query.gte("last_message_at", options.from);
    if (options.to) query = query.lt("last_message_at", options.to);
    if (options.cursor) query = query.lt("last_message_at", options.cursor);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data as unknown as ConversationRow[];
    const hasMore = rows.length > options.limit;
    const page = hasMore ? rows.slice(0, options.limit) : rows;

    return {
      items: page.map(toConversation),
      nextCursor: hasMore ? (page[page.length - 1]?.last_message_at ?? null) : null,
    };
  },
};
