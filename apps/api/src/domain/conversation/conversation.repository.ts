import type {
  Conversation,
  CreateConversation,
  FolderAssignmentSource,
  Message,
  SendMessage,
  UpdateConversation,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import { forUser } from "../../core/supabase/supabase.js";
import type { IConversationRepository } from "./conversation.repository.interface.js";

/**
 * Ligne Postgres d'une conversation — snake_case, telle que renvoyée par
 * Supabase. Exportée avec son mapper et sa liste de colonnes : la recherche
 * (`feature/search`) lit la même table, et deux définitions divergeraient à la
 * première colonne ajoutée.
 */
export type ConversationRow = {
  id: string;
  kind: string;
  title: string;
  archived_at: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  conversation_folders?: { folder_id: string }[] | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  input_mode: string;
  provider: string | null;
  model: string | null;
  choices: string[] | null;
  redirect_title: string | null;
  redirect_accepted_at: string | null;
  created_at: string;
};

export function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    kind: row.kind as Conversation["kind"],
    title: row.title,
    // Le rangement matriciel remonte sous forme de tableau d'identifiants :
    // les clients n'ont jamais à connaître la table de liaison (§5.2).
    folderIds: (row.conversation_folders ?? []).map((link) => link.folder_id),
    archivedAt: row.archived_at,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as Message["role"],
    content: row.content,
    inputMode: row.input_mode as Message["inputMode"],
    provider: row.provider,
    model: row.model,
    choices: row.choices,
    redirectTitle: row.redirect_title,
    redirectAcceptedAt: row.redirect_accepted_at,
    createdAt: row.created_at,
  };
}

export const CONVERSATION_COLUMNS =
  "id, kind, title, archived_at, last_message_at, created_at, updated_at, conversation_folders(folder_id)";
const MESSAGE_COLUMNS =
  "id, conversation_id, role, content, input_mode, provider, model, choices, " +
  "redirect_title, redirect_accepted_at, created_at";

export const conversationRepository: IConversationRepository = {
  async findAll(accessToken, options) {
    let query = forUser(accessToken)
      .from("conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("kind", "chat")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      // Une ligne de plus que demandé : la présence du surplus indique qu'il
      // reste des résultats, sans requête `count` supplémentaire.
      .limit(options.limit + 1);

    if (!options.includeArchived) query = query.is("archived_at", null);
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

  async findById(id, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toConversation(data as unknown as ConversationRow) : null;
  },

  async findAssistantChannel(accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("kind", "assistant")
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toConversation(data as unknown as ConversationRow) : null;
  },

  async create(userId, input: CreateConversation, kind, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("conversations")
      .insert({
        user_id: userId,
        kind,
        ...(input.title ? { title: input.title } : {}),
      })
      .select(CONVERSATION_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    const conversation = toConversation(data as unknown as ConversationRow);

    if (input.folderIds.length > 0) {
      const folderIds = await this.setFolders(
        conversation.id,
        input.folderIds,
        "user",
        accessToken,
      );
      return { ...conversation, folderIds };
    }

    return conversation;
  },

  async update(id, patch: UpdateConversation, accessToken) {
    const payload: Record<string, unknown> = {};
    if (patch.title !== undefined) payload["title"] = patch.title;
    if (patch.archived !== undefined) {
      payload["archived_at"] = patch.archived ? new Date().toISOString() : null;
    }

    const { data, error } = await forUser(accessToken)
      .from("conversations")
      .update(payload)
      .eq("id", id)
      .select(CONVERSATION_COLUMNS)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw httpError(404, "Conversation introuvable.");
    return toConversation(data as unknown as ConversationRow);
  },

  async delete(id, accessToken) {
    const { error } = await forUser(accessToken).from("conversations").delete().eq("id", id);

    if (error) throw new Error(error.message);
  },

  /**
   * Aligne les rattachements de la conversation sur `folderIds` (§5.2, A.1).
   *
   * On calcule le différentiel plutôt que de tout effacer puis tout réinsérer :
   * une liaison déjà présente doit conserver son `source` d'origine. Sans cela,
   * un classement automatique proposé par l'assistant écraserait la trace d'un
   * rangement fait manuellement par l'utilisateur — signal dont l'assistant a
   * besoin pour apprendre sa logique d'organisation (A.7).
   */
  async setFolders(conversationId, folderIds, source: FolderAssignmentSource, accessToken) {
    const client = forUser(accessToken);
    const target = [...new Set(folderIds)];

    const { data: existingRows, error: readError } = await client
      .from("conversation_folders")
      .select("folder_id")
      .eq("conversation_id", conversationId);

    if (readError) throw new Error(readError.message);

    const existing = new Set(
      (existingRows as unknown as { folder_id: string }[]).map((r) => r.folder_id),
    );
    const toRemove = [...existing].filter((id) => !target.includes(id));
    const toAdd = target.filter((id) => !existing.has(id));

    if (toRemove.length > 0) {
      const { error } = await client
        .from("conversation_folders")
        .delete()
        .eq("conversation_id", conversationId)
        .in("folder_id", toRemove);

      if (error) throw new Error(error.message);
    }

    if (toAdd.length > 0) {
      const { error } = await client.from("conversation_folders").insert(
        toAdd.map((folderId) => ({
          conversation_id: conversationId,
          folder_id: folderId,
          source,
        })),
      );

      if (error) throw new Error(error.message);
    }

    return target;
  },

  async listMessages(conversationId, accessToken, options) {
    let query = forUser(accessToken)
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(options.limit + 1);

    if (options.cursor) query = query.lt("created_at", options.cursor);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data as unknown as MessageRow[];
    const hasMore = rows.length > options.limit;
    const page = hasMore ? rows.slice(0, options.limit) : rows;

    return {
      // Requête en ordre décroissant pour paginer depuis le message le plus
      // récent, puis remise en ordre chronologique pour l'affichage du fil.
      items: page.map(toMessage).reverse(),
      nextCursor: hasMore ? (page[page.length - 1]?.created_at ?? null) : null,
    };
  },

  async appendMessage(
    conversationId,
    userId,
    message: SendMessage & {
      role: Message["role"];
      provider?: string | null;
      model?: string | null;
      choices?: string[] | null;
      redirectTitle?: string | null;
    },
    accessToken,
  ) {
    const client = forUser(accessToken);

    const { data, error } = await client
      .from("messages")
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: message.role,
        content: message.content,
        input_mode: message.inputMode,
        provider: message.provider ?? null,
        model: message.model ?? null,
        choices: message.choices ?? null,
        redirect_title: message.redirectTitle ?? null,
      })
      .select(MESSAGE_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    const created = toMessage(data as unknown as MessageRow);

    // `last_message_at` pilote le tri de la liste des conversations : le tenir
    // à jour ici évite un agrégat sur `messages` à chaque chargement de liste.
    const { error: touchError } = await client
      .from("conversations")
      .update({ last_message_at: created.createdAt })
      .eq("id", conversationId);

    if (touchError) throw new Error(touchError.message);

    return created;
  },

  async findMessage(id, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toMessage(data as unknown as MessageRow) : null;
  },

  async updateMessageContent(id, content, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("messages")
      .update({ content })
      .eq("id", id)
      .select(MESSAGE_COLUMNS)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw httpError(404, "Message introuvable.");
    return toMessage(data as unknown as MessageRow);
  },

  async deleteMessage(id, accessToken) {
    const { error } = await forUser(accessToken).from("messages").delete().eq("id", id);

    if (error) throw new Error(error.message);
  },

  async deleteMessagesAfter(conversationId, createdAt, accessToken) {
    const { error } = await forUser(accessToken)
      .from("messages")
      .delete()
      .eq("conversation_id", conversationId)
      .gt("created_at", createdAt);

    if (error) throw new Error(error.message);
  },

  async acceptRedirect(id, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("messages")
      .update({ redirect_accepted_at: new Date().toISOString() })
      .eq("id", id)
      .select(MESSAGE_COLUMNS)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw httpError(404, "Message introuvable.");
    return toMessage(data as unknown as MessageRow);
  },
};
