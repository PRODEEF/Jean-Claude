import { randomUUID } from "node:crypto";
import type {
  Group,
  GroupEventSuggestion,
  GroupListSuggestion,
  GroupMessage,
  MessageAttachmentMimeType,
} from "@jc/domain";
import { signAttachmentUrls } from "../../core/storage/attachment-storage.js";
import { forUser } from "../../core/supabase/supabase.js";
import type {
  AssistantReply,
  EventProposal,
  IGroupRepository,
  ListProposal,
  WorkspaceMemberName,
} from "./group.repository.interface.js";

/** Lignes Postgres — snake_case, telles que renvoyées par Supabase. */
type GroupRow = {
  id: string;
  workspace_id: string;
  title: string;
  ai_muted: boolean;
  last_message_at: string | null;
  created_at: string;
  conversation_folders: { folder_id: string }[] | null;
};

/** Adhésion de l'appelant, avec le groupe embarqué. */
type MembershipRow = { unread_count: number; conversations: GroupRow | null };

type MemberRow = { conversation_id: string; user_id: string };

type QuotedMessageRow = { id: string; user_id: string; role: string; content: string };

type AttachmentSubRow = {
  id: string;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  file_name: string;
  extracted_text: string | null;
  created_at: string;
  deleted_at: string | null;
};

type GroupMessageRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  content: string;
  provider: string | null;
  created_at: string;
  reply_to: QuotedMessageRow | null;
  message_attachments: AttachmentSubRow[] | null;
};

type SuggestionRow = {
  id: string;
  conversation_id: string;
  message_id: string;
  payload: ListProposal;
  status: string;
  list_id: string | null;
  created_at: string;
};

function toSuggestion(row: SuggestionRow): GroupListSuggestion {
  return {
    id: row.id,
    groupId: row.conversation_id,
    messageId: row.message_id,
    title: row.payload.title,
    tasks: row.payload.tasks,
    status: row.status as GroupListSuggestion["status"],
    listId: row.list_id,
    createdAt: row.created_at,
  };
}

const SUGGESTION_COLUMNS = "id, conversation_id, message_id, payload, status, list_id, created_at";

type EventSuggestionRow = Omit<SuggestionRow, "payload" | "list_id"> & {
  payload: EventProposal;
  event_id: string | null;
};

const EVENT_SUGGESTION_COLUMNS =
  "id, conversation_id, message_id, payload, status, event_id, created_at";

function toEventSuggestion(row: EventSuggestionRow): GroupEventSuggestion {
  return {
    id: row.id,
    groupId: row.conversation_id,
    messageId: row.message_id,
    title: row.payload.title,
    startsAt: row.payload.startsAt,
    endsAt: row.payload.endsAt,
    allDay: row.payload.allDay,
    notes: row.payload.notes,
    status: row.status as GroupEventSuggestion["status"],
    eventId: row.event_id,
    createdAt: row.created_at,
  };
}

/**
 * Marque les annonces (`GROUP_WELCOME`, réglage changé, réponse impossible) qui
 * partagent le rôle `system` avec les lignes du calendrier. Le modèle lit les
 * secondes, pas les premières ; la colonne `provider`, vide pour tout autre
 * message système, évite une migration pour un seul drapeau.
 */
const ANNOUNCEMENT_MARK = "announcement";

function toGroup(row: GroupRow, unreadCount: number, memberIds: string[]): Group {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    memberIds,
    folderIds: (row.conversation_folders ?? []).map((link) => link.folder_id),
    aiMuted: row.ai_muted,
    unreadCount,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  };
}

/**
 * Mappe une ligne à partir d'URLs déjà signées, en lot par `signMessages`.
 * Une pièce supprimée, ou dont l'objet a disparu, ne rend que son nom.
 */
function toMessage(row: GroupMessageRow, urlByPath: ReadonlyMap<string, string>): GroupMessage {
  const attachments: GroupMessage["attachments"] = [];
  const removedAttachments: GroupMessage["removedAttachments"] = [];
  for (const a of row.message_attachments ?? []) {
    const url = a.deleted_at ? undefined : urlByPath.get(a.storage_path);
    if (!url) {
      removedAttachments.push({ id: a.id, fileName: a.file_name });
      continue;
    }
    attachments.push({
      id: a.id,
      url,
      fileName: a.file_name,
      mimeType: a.mime_type as MessageAttachmentMimeType,
      byteSize: a.byte_size,
      extractedText: a.extracted_text,
      createdAt: a.created_at,
    });
  }

  return {
    id: row.id,
    groupId: row.conversation_id,
    authorId: row.user_id,
    role: row.role as GroupMessage["role"],
    content: row.content,
    announcement: row.role === "system" && row.provider === ANNOUNCEMENT_MARK,
    replyTo: row.reply_to
      ? {
          id: row.reply_to.id,
          authorId: row.reply_to.user_id,
          role: row.reply_to.role as GroupMessage["role"],
          content: row.reply_to.content,
        }
      : null,
    attachments,
    removedAttachments,
    createdAt: row.created_at,
  };
}

// `!inner` : sans lui, le filtre sur l'espace laisserait passer les adhésions
// d'autres espaces avec un groupe `null` au lieu de les écarter.
const MEMBERSHIP_COLUMNS =
  "unread_count, conversations!inner(id, workspace_id, title, ai_muted, last_message_at, created_at, conversation_folders(folder_id))";
// Le message cité voyage avec la réponse : il peut être hors de la page
// chargée. La table se référence elle-même : on embarque par la colonne
// `reply_to_id` (message cité, un objet ou `null`). `messages!reply_to_id`
// suivrait le lien à l'envers et rendrait les réponses à ce message, en
// tableau — vérifié contre PostgREST 12.
const MESSAGE_COLUMNS =
  "id, conversation_id, user_id, role, content, provider, created_at, reply_to:reply_to_id(id, user_id, role, content), " +
  "message_attachments(id, storage_path, mime_type, byte_size, file_name, extracted_text, created_at, deleted_at)";

/** Signe en un seul aller-retour les fichiers de toute une page de messages. */
async function signMessages(
  client: ReturnType<typeof forUser>,
  rows: GroupMessageRow[],
): Promise<GroupMessage[]> {
  const paths = rows.flatMap((row) =>
    (row.message_attachments ?? []).filter((a) => a.deleted_at === null).map((a) => a.storage_path),
  );
  const urlByPath = await signAttachmentUrls(client, paths);
  return rows.map((row) => toMessage(row, urlByPath));
}

export const groupRepository: IGroupRepository = {
  async findWorkspaceMembers(workspaceId, accessToken) {
    const { data, error } = await forUser(accessToken).rpc("workspace_member_profiles", {
      p_workspace: workspaceId,
    });

    if (error) throw new Error(error.message);
    // L'adresse n'est pas reprise : elle n'a rien à faire dans un prompt.
    return (data as unknown as { user_id: string; display_name: string | null }[]).map(
      (row): WorkspaceMemberName => ({ userId: row.user_id, displayName: row.display_name }),
    );
  },

  async findByWorkspace(workspaceId, userId, accessToken) {
    const client = forUser(accessToken);
    const { data, error } = await client
      .from("conversation_members")
      .select(MEMBERSHIP_COLUMNS)
      .eq("user_id", userId)
      .eq("conversations.workspace_id", workspaceId);

    if (error) throw new Error(error.message);
    const memberships = (data as unknown as MembershipRow[]).filter(
      (row): row is MembershipRow & { conversations: GroupRow } => row.conversations !== null,
    );
    if (memberships.length === 0) return [];

    const members = await findMembers(
      client,
      memberships.map((row) => row.conversations.id),
    );

    return memberships
      .map((row) =>
        toGroup(row.conversations, row.unread_count, members.get(row.conversations.id) ?? []),
      )
      .sort(byRecentActivity);
  },

  async findById(id, userId, accessToken) {
    const client = forUser(accessToken);
    const { data, error } = await client
      .from("conversation_members")
      .select(MEMBERSHIP_COLUMNS)
      .eq("user_id", userId)
      .eq("conversation_id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    const row = data as unknown as MembershipRow | null;
    if (!row?.conversations) return null;

    const members = await findMembers(client, [id]);
    return toGroup(row.conversations, row.unread_count, members.get(id) ?? []);
  },

  async create(userId, input, accessToken) {
    const client = forUser(accessToken);
    // Composé ici plutôt que relu : le groupe n'est lisible qu'une fois son
    // créateur inscrit comme membre, un `insert … returning` serait refusé.
    const group: Group = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      title: input.title,
      memberIds: [userId, ...input.memberIds],
      folderIds: [],
      aiMuted: false,
      unreadCount: 0,
      lastMessageAt: null,
      createdAt: new Date().toISOString(),
    };

    const { error } = await client.from("conversations").insert({
      id: group.id,
      user_id: userId,
      kind: "group",
      title: group.title,
      workspace_id: group.workspaceId,
      created_at: group.createdAt,
    });
    if (error) throw new Error(error.message);

    // Le créateur d'abord, seul : la RLS ne l'autorise à ajouter les autres
    // qu'une fois lui-même membre.
    const { error: selfError } = await client
      .from("conversation_members")
      .insert({ conversation_id: group.id, user_id: userId });
    if (selfError) throw new Error(selfError.message);

    if (input.memberIds.length > 0) {
      const { error: othersError } = await client
        .from("conversation_members")
        .insert(input.memberIds.map((id) => ({ conversation_id: group.id, user_id: id })));
      if (othersError) throw new Error(othersError.message);
    }

    return group;
  },

  async setAiMuted(groupId, aiMuted, accessToken) {
    const { error } = await forUser(accessToken)
      .from("conversations")
      .update({ ai_muted: aiMuted })
      .eq("id", groupId);

    if (error) throw new Error(error.message);
  },

  async findWorkspaceFolderIds(workspaceId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("folders")
      .select("id")
      .eq("workspace_id", workspaceId);

    if (error) throw new Error(error.message);
    return (data as { id: string }[]).map((row) => row.id);
  },

  async setFolders(groupId, folderIds, accessToken) {
    const client = forUser(accessToken);
    const { data, error } = await client
      .from("conversation_folders")
      .select("folder_id")
      .eq("conversation_id", groupId);
    if (error) throw new Error(error.message);

    // Le différentiel plutôt que tout effacer : une liaison déjà posée garde
    // sa date et son origine.
    const current = (data as { folder_id: string }[]).map((row) => row.folder_id);
    const removed = current.filter((id) => !folderIds.includes(id));
    const added = folderIds.filter((id) => !current.includes(id));

    if (removed.length > 0) {
      const { error: deleteError } = await client
        .from("conversation_folders")
        .delete()
        .eq("conversation_id", groupId)
        .in("folder_id", removed);
      if (deleteError) throw new Error(deleteError.message);
    }

    if (added.length > 0) {
      const { error: insertError } = await client
        .from("conversation_folders")
        .insert(added.map((folderId) => ({ conversation_id: groupId, folder_id: folderId })));
      if (insertError) throw new Error(insertError.message);
    }
  },

  async findLatestMessageId(groupId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("messages")
      .select("id")
      .eq("conversation_id", groupId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as { id: string } | null)?.id ?? null;
  },

  async findMessages(groupId, options, accessToken) {
    const client = forUser(accessToken);
    let query = client
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", groupId)
      .in("role", ["user", "assistant", "system"])
      .order("created_at", { ascending: false })
      .limit(options.limit + 1);

    if (options.cursor) query = query.lt("created_at", options.cursor);
    if (options.forModel) query = query.or(`provider.is.null,provider.neq.${ANNOUNCEMENT_MARK}`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data as unknown as GroupMessageRow[];
    const hasMore = rows.length > options.limit;
    const page = hasMore ? rows.slice(0, options.limit) : rows;

    // Même geste que le fil personnel : on pagine depuis le plus récent, puis
    // on remet la page dans l'ordre de lecture.
    return {
      items: (await signMessages(client, page)).reverse(),
      nextCursor: hasMore ? (page[page.length - 1]?.created_at ?? null) : null,
    };
  },

  async findMessage(groupId, messageId, accessToken) {
    const client = forUser(accessToken);
    const { data, error } = await client
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", groupId)
      .eq("id", messageId)
      .in("role", ["user", "assistant"])
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    const [message] = await signMessages(client, [data as unknown as GroupMessageRow]);
    return message ?? null;
  },

  appendMessage(groupId, userId, content, replyToId, accessToken) {
    return insertMessage(forUser(accessToken), {
      conversation_id: groupId,
      user_id: userId,
      role: "user",
      content,
      input_mode: "text",
      reply_to_id: replyToId,
    });
  },

  appendAssistantMessage(groupId, userId, reply: AssistantReply, accessToken) {
    return insertMessage(forUser(accessToken), {
      conversation_id: groupId,
      user_id: userId,
      role: "assistant",
      content: reply.content,
      input_mode: "text",
      provider: reply.provider,
      model: reply.model,
    });
  },

  appendSystemMessage(groupId, userId, content, accessToken) {
    return insertMessage(forUser(accessToken), {
      conversation_id: groupId,
      user_id: userId,
      role: "system",
      content,
      input_mode: "text",
      provider: ANNOUNCEMENT_MARK,
    });
  },

  async findAssistantModel(userId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("profiles")
      .select("llm_model")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as { llm_model: string | null } | null)?.llm_model ?? null;
  },

  async createListSuggestion(groupId, messageId, userId, proposal, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_list_suggestions")
      .insert({
        conversation_id: groupId,
        message_id: messageId,
        payload: proposal,
        created_by: userId,
      })
      .select(SUGGESTION_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return toSuggestion(data as unknown as SuggestionRow);
  },

  async findListSuggestions(groupId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_list_suggestions")
      .select(SUGGESTION_COLUMNS)
      .eq("conversation_id", groupId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data as unknown as SuggestionRow[]).map(toSuggestion);
  },

  async resolveListSuggestion(suggestionId, status, userId, accessToken) {
    // Conditionnée à `pending` : c'est la base qui départage deux réponses
    // simultanées, pas une lecture préalable.
    const { data, error } = await forUser(accessToken)
      .from("workspace_list_suggestions")
      .update({ status, resolved_by: userId, resolved_at: new Date().toISOString() })
      .eq("id", suggestionId)
      .eq("status", "pending")
      .select(SUGGESTION_COLUMNS)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toSuggestion(data as unknown as SuggestionRow) : null;
  },

  async setSuggestionList(suggestionId, listId, accessToken) {
    const { error } = await forUser(accessToken)
      .from("workspace_list_suggestions")
      .update({ list_id: listId })
      .eq("id", suggestionId);
    if (error) throw new Error(error.message);
  },

  async reopenListSuggestion(suggestionId, accessToken) {
    const { error } = await forUser(accessToken)
      .from("workspace_list_suggestions")
      .update({ status: "pending", resolved_by: null, resolved_at: null })
      .eq("id", suggestionId);
    if (error) throw new Error(error.message);
  },

  async findTimezone(userId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as { timezone: string } | null)?.timezone ?? "Europe/Paris";
  },

  async createEventSuggestion(groupId, messageId, userId, proposal, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_event_suggestions")
      .insert({
        conversation_id: groupId,
        message_id: messageId,
        payload: proposal,
        created_by: userId,
      })
      .select(EVENT_SUGGESTION_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return toEventSuggestion(data as unknown as EventSuggestionRow);
  },

  async findEventSuggestions(groupId, accessToken) {
    const { data, error } = await forUser(accessToken)
      .from("workspace_event_suggestions")
      .select(EVENT_SUGGESTION_COLUMNS)
      .eq("conversation_id", groupId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data as unknown as EventSuggestionRow[]).map(toEventSuggestion);
  },

  async resolveEventSuggestion(suggestionId, status, userId, accessToken) {
    // Conditionnée à `pending`, comme pour les listes : la base départage.
    const { data, error } = await forUser(accessToken)
      .from("workspace_event_suggestions")
      .update({ status, resolved_by: userId, resolved_at: new Date().toISOString() })
      .eq("id", suggestionId)
      .eq("status", "pending")
      .select(EVENT_SUGGESTION_COLUMNS)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toEventSuggestion(data as unknown as EventSuggestionRow) : null;
  },

  async setSuggestionEvent(suggestionId, eventId, accessToken) {
    const { error } = await forUser(accessToken)
      .from("workspace_event_suggestions")
      .update({ event_id: eventId })
      .eq("id", suggestionId);
    if (error) throw new Error(error.message);
  },

  async reopenEventSuggestion(suggestionId, accessToken) {
    const { error } = await forUser(accessToken)
      .from("workspace_event_suggestions")
      .update({ status: "pending", resolved_by: null, resolved_at: null })
      .eq("id", suggestionId);
    if (error) throw new Error(error.message);
  },

  async markRead(groupId, userId, accessToken) {
    const { error } = await forUser(accessToken)
      .from("conversation_members")
      .update({ unread_count: 0, last_read_at: new Date().toISOString() })
      .eq("conversation_id", groupId)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);
  },
};

async function insertMessage(
  client: ReturnType<typeof forUser>,
  row: Record<string, unknown>,
): Promise<GroupMessage> {
  const { data, error } = await client
    .from("messages")
    .insert(row)
    .select(MESSAGE_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  // Un message tout juste inséré n'a pas encore de fichier : ils le rejoignent
  // après (`linkAttachments`), et le service les ajoute à ce qu'il rend.
  const message = toMessage(data as unknown as GroupMessageRow, new Map());

  // `last_message_at` ordonne la liste des groupes, comme celle des
  // conversations personnelles.
  const { error: touchError } = await client
    .from("conversations")
    .update({ last_message_at: message.createdAt })
    .eq("id", message.groupId);
  if (touchError) throw new Error(touchError.message);

  return message;
}

async function findMembers(
  client: ReturnType<typeof forUser>,
  groupIds: string[],
): Promise<Map<string, string[]>> {
  const { data, error } = await client
    .from("conversation_members")
    .select("conversation_id, user_id")
    .in("conversation_id", groupIds);

  if (error) throw new Error(error.message);

  const members = new Map<string, string[]>();
  for (const row of data as unknown as MemberRow[]) {
    members.set(row.conversation_id, [...(members.get(row.conversation_id) ?? []), row.user_id]);
  }
  return members;
}

/** Le groupe le plus récemment actif d'abord ; un groupe sans message, par date de création. */
function byRecentActivity(a: Group, b: Group): number {
  const left = a.lastMessageAt ?? a.createdAt;
  const right = b.lastMessageAt ?? b.createdAt;
  return right.localeCompare(left);
}
