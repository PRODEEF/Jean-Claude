import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AssignFolders,
  Conversation,
  CreateConversation,
  CursorPagination,
  Message,
  MessageStreamEvent,
  Paginated,
  SendMessage,
  UpdateConversation,
} from "@jc/domain";
import { LLM_PROVIDER, type LlmProvider } from "../../core/llm/llm.port";
import { CHAT_TOOLS } from "../../core/llm/llm.tools";
import {
  CONVERSATION_REPOSITORY,
  type IConversationRepository,
} from "./conversation.repository.interface";

/** Nombre de messages de contexte envoyés au modèle à chaque tour. */
const CONTEXT_WINDOW_MESSAGES = 40;

@Injectable()
export class ConversationService {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversations: IConversationRepository,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  list(
    accessToken: string,
    pagination: CursorPagination,
    includeArchived = false,
  ): Promise<Paginated<Conversation>> {
    return this.conversations.findAll(accessToken, {
      ...(pagination.cursor ? { cursor: pagination.cursor } : {}),
      limit: pagination.limit,
      includeArchived,
    });
  }

  async getById(id: string, accessToken: string): Promise<Conversation> {
    const conversation = await this.conversations.findById(id, accessToken);
    if (!conversation) throw new NotFoundException("Conversation introuvable.");
    return conversation;
  }

  create(userId: string, input: CreateConversation, accessToken: string): Promise<Conversation> {
    return this.conversations.create(userId, input, "chat", accessToken);
  }

  /**
   * Canal permanent Jean-Claude (A.10), créé à la volée s'il n'existe pas.
   *
   * L'unicité est garantie par un index partiel en base : deux requêtes
   * concurrentes ne peuvent pas créer deux canaux pour le même utilisateur.
   */
  async getOrCreateAssistantChannel(userId: string, accessToken: string): Promise<Conversation> {
    const existing = await this.conversations.findAssistantChannel(accessToken);
    if (existing) return existing;

    return this.conversations.create(
      userId,
      { title: "Jean-Claude", folderIds: [] },
      "assistant",
      accessToken,
    );
  }

  update(id: string, patch: UpdateConversation, accessToken: string): Promise<Conversation> {
    return this.conversations.update(id, patch, accessToken);
  }

  async delete(id: string, accessToken: string): Promise<void> {
    await this.getById(id, accessToken);
    await this.conversations.delete(id, accessToken);
  }

  /**
   * Rattache la conversation à un ensemble de dossiers (§5.2, A.1).
   *
   * L'appel est idempotent et remplace l'ensemble : c'est la sémantique
   * attendue par une UI où l'utilisateur coche et décoche des dossiers.
   */
  async assignFolders(
    id: string,
    input: AssignFolders,
    accessToken: string,
  ): Promise<Conversation> {
    await this.getById(id, accessToken);
    await this.conversations.setFolders(id, input.folderIds, input.source, accessToken);
    return this.getById(id, accessToken);
  }

  listMessages(
    conversationId: string,
    accessToken: string,
    pagination: CursorPagination,
  ): Promise<Paginated<Message>> {
    return this.conversations.listMessages(conversationId, accessToken, {
      ...(pagination.cursor ? { cursor: pagination.cursor } : {}),
      limit: pagination.limit,
    });
  }

  /**
   * Déroule un tour de dialogue en flux : le message de l'utilisateur, puis la
   * réponse du modèle au fil de sa génération, puis la réponse persistée.
   *
   * Il n'existe pas de variante bloquante. En maintenir une en parallèle ferait
   * deux implémentations du même tour, à tenir cohérentes ; un appelant qui
   * veut la réponse entière consomme le flux jusqu'au bout.
   *
   * Les appels d'outils renvoyés par le modèle (`suggest_task_list`,
   * `suggest_folders`...) ne sont volontairement PAS exécutés ici : ils
   * doivent devenir des suggestions en attente, que l'utilisateur accepte ou
   * ignore (§12.1 — « l'assistant propose, l'utilisateur valide »). Le module
   * `feature/assistant` s'en chargera.
   */
  async *streamMessage(
    conversationId: string,
    userId: string,
    input: SendMessage,
    accessToken: string,
  ): AsyncGenerator<MessageStreamEvent> {
    const conversation = await this.getById(conversationId, accessToken);

    const userMessage = await this.conversations.appendMessage(
      conversationId,
      userId,
      { ...input, role: "user" },
      accessToken,
    );

    yield { type: "message", message: userMessage };

    const history = await this.conversations.listMessages(conversationId, accessToken, {
      limit: CONTEXT_WINDOW_MESSAGES,
    });

    let text = "";
    let provider: string | null = null;
    let model: string | null = null;

    try {
      const stream = this.llm.stream({
        system: buildSystemPrompt(conversation.kind),
        messages: history.items
          // Les messages `system` stockés ne sont pas rejouables comme des tours
          // de dialogue : la consigne système est reconstruite à chaque appel.
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        tools: CHAT_TOOLS,
      });

      for await (const chunk of stream) {
        if (chunk.type === "text") {
          text += chunk.text;
          yield { type: "text", text: chunk.text };
        } else if (chunk.type === "done") {
          provider = chunk.response.provider;
          model = chunk.response.model;
        }
      }
    } finally {
      // `finally` et non la sortie nominale : si le client se déconnecte en
      // pleine génération, le texte déjà produit est déjà facturé. Le perdre
      // priverait l'utilisateur d'une réponse qu'il retrouverait de toute façon
      // au rechargement.
      if (text.length > 0) {
        const assistantMessage = await this.conversations.appendMessage(
          conversationId,
          userId,
          { content: text, inputMode: "text", role: "assistant", provider, model },
          accessToken,
        );

        yield { type: "done", message: assistantMessage };
      }
    }
  }
}

/**
 * Consigne système, différenciée selon le registre de la conversation (A.10).
 *
 * Le bornage du canal permanent est appliqué ici, côté serveur, et non dans
 * l'UI : c'est une règle métier, elle doit valoir identiquement pour le web,
 * le mobile et le desktop (§5.3).
 */
function buildSystemPrompt(kind: Conversation["kind"]): string {
  if (kind === "assistant") {
    return [
      "Tu es Jean-Claude, l'assistant d'organisation personnelle de l'utilisateur.",
      "Ce canal est réservé à trois sujets : les rappels (ce qui est important",
      "aujourd'hui ou cette semaine), l'organisation interne de l'outil (dossiers,",
      "rangement, structure), et l'évolution de la structure du projet de l'utilisateur.",
      "",
      "Si la demande sort de ce périmètre, ne la traite pas ici : indique brièvement",
      "que tu ouvres une conversation dédiée, et propose un titre pour celle-ci.",
      "",
      "Prends les devants : quand un échange laisse deviner une action à faire,",
      "propose-la plutôt que d'attendre qu'on te la demande. Reste suggestif —",
      "une proposition courte que l'utilisateur accepte ou ignore d'un geste.",
    ].join("\n");
  }

  return [
    "Tu es Jean-Claude, un assistant conversationnel personnel.",
    "Réponds de façon utile, directe et naturelle, en français.",
    "",
    "Au fil de l'échange, repère si la conversation produit quelque chose",
    "d'actionnable : une liste de tâches, une liste d'achats, une échéance,",
    "un rendez-vous récurrent. Le cas échéant, appelle l'outil correspondant",
    "pour le proposer — sans interrompre le fil de la conversation, et sans",
    "jamais présenter la chose comme déjà faite : c'est une proposition.",
  ].join("\n");
}
