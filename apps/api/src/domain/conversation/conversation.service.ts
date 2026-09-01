import { DEFAULT_CONVERSATION_TITLE, labelSchema } from "@jc/domain";
import type {
  AssignFolders,
  Conversation,
  CreateConversation,
  CursorPagination,
  FolderTreeNode,
  Message,
  MessageStreamEvent,
  Paginated,
  SendMessage,
  UpdateConversation,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import type { LlmProvider, LlmTool, LlmToolCall } from "../../core/llm/llm.port.js";
import {
  ASSISTANT_TOOLS,
  CHAT_TOOLS,
  NAME_CONVERSATION,
  OPEN_NEW_CONVERSATION,
  SUGGEST_FOLDERS,
} from "../../core/llm/llm.tools.js";
import type { FolderService } from "../folder/folder.service.js";
import type { SuggestionService } from "../suggestion/suggestion.service.js";
import type { IConversationRepository } from "./conversation.repository.interface.js";

/** Nombre de messages de contexte envoyés au modèle à chaque tour. */
const CONTEXT_WINDOW_MESSAGES = 40;

/**
 * Outils que le serveur applique lui-même, et qui ne deviennent donc pas des
 * propositions à valider. Ils ne touchent pas aux données de l'utilisateur :
 * l'un nomme la conversation, l'autre choisit où la réponse sera donnée.
 */
const APPLIED_DIRECTLY = new Set([NAME_CONVERSATION.name, OPEN_NEW_CONVERSATION.name]);

/**
 * Ce que le tour peut encore faire du fil. `filing` à `null` signifie qu'aucun
 * rangement n'est à proposer — un tableau de dossiers vide, lui, resterait
 * ambigu : l'utilisateur peut n'avoir aucun dossier et attendre le premier.
 */
type Housekeeping = {
  tools: LlmTool[];
  filing: { folders: FolderTreeNode[] } | null;
};

export class ConversationService {
  constructor(
    private readonly conversations: IConversationRepository,
    private readonly llm: LlmProvider,
    private readonly suggestions: SuggestionService,
    private readonly folders: FolderService,
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
    if (!conversation) throw httpError(404, "Conversation introuvable.");
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
   * Les appels d'outils renvoyés par le modèle ne sont jamais exécutés : ils
   * deviennent des suggestions en attente, que l'utilisateur accepte ou ignore
   * (§12.1 — « l'assistant propose, l'utilisateur valide »).
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
    const toolCalls: LlmToolCall[] = [];

    // Ce que le fil laisse encore à faire : le nommer, le ranger. Résolu avant
    // l'appel au modèle, parce que cela décide des outils qu'on lui expose.
    const todo = await this.pendingHousekeeping(conversation, accessToken);

    try {
      const stream = this.llm.stream({
        system: buildSystemPrompt(conversation.kind, todo),
        messages: history.items
          // Les messages `system` stockés ne sont pas rejouables comme des tours
          // de dialogue : la consigne système est reconstruite à chaque appel.
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        tools: todo.tools,
      });

      for await (const chunk of stream) {
        if (chunk.type === "text") {
          text += chunk.text;
          yield { type: "text", text: chunk.text };
        } else if (chunk.type === "tool_call") {
          toolCalls.push(chunk.toolCall);
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
      const assistantMessage =
        text.length > 0
          ? await this.conversations.appendMessage(
              conversationId,
              userId,
              { content: text, inputMode: "text", role: "assistant", provider, model },
              accessToken,
            )
          : null;

      // Écrites avant le dernier `yield`, et non après : rien n'oblige
      // l'appelant à consommer cet événement, et le code qui le suivrait ne
      // s'exécuterait alors jamais. Une proposition perdue ici le serait
      // définitivement — le modèle ne sera pas rejoué.
      for (const toolCall of toolCalls) {
        if (APPLIED_DIRECTLY.has(toolCall.name)) continue;
        await this.suggestions.capture(userId, conversationId, toolCall, accessToken);
      }

      await this.applyRequestedTitle(conversationId, toolCalls, accessToken);

      const redirect = await this.openRequestedConversation(userId, toolCalls, accessToken);

      if (assistantMessage) yield { type: "done", message: assistantMessage };
      if (redirect) yield { type: "redirect", conversation: redirect };
    }
  }

  /**
   * Outils du tour, et arborescence à injecter dans la consigne.
   *
   * Le canal permanent a son propre jeu (A.10). Une conversation classique
   * reçoit en plus de quoi se nommer tant qu'elle porte le titre par défaut, et
   * de quoi se ranger tant qu'elle n'est dans aucun dossier — mais pas si une
   * proposition de rangement attend déjà une réponse : la relancer à chaque
   * message empilerait les cartes sur un geste que l'utilisateur a laissé venir.
   */
  private async pendingHousekeeping(
    conversation: Conversation,
    accessToken: string,
  ): Promise<Housekeeping> {
    if (conversation.kind === "assistant") return { tools: ASSISTANT_TOOLS, filing: null };

    // `SUGGEST_FOLDERS` n'est rendu qu'aux conversations non classées : il n'a
    // rien à proposer sur un fil déjà rangé.
    const tools = CHAT_TOOLS.filter((tool) => tool !== SUGGEST_FOLDERS);

    if (conversation.title === DEFAULT_CONVERSATION_TITLE) tools.push(NAME_CONVERSATION);

    if (conversation.folderIds.length > 0) return { tools, filing: null };

    const pending = await this.suggestions.listPending(conversation.id, accessToken);
    if (pending.some((suggestion) => suggestion.kind === "assign_folders")) {
      return { tools, filing: null };
    }

    tools.push(SUGGEST_FOLDERS);
    return { tools, filing: { folders: await this.folders.getTree(accessToken) } };
  }

  /**
   * Titre déduit de l'échange (§5.2).
   *
   * Appliqué directement, sans passer par une suggestion : le titre est le
   * libellé de la conversation, pas une donnée que l'utilisateur aurait créée,
   * et le schéma partagé le décrit depuis le début comme « généré par
   * l'assistant, éditable par l'utilisateur ». Aucune des applications de
   * référence du §4.2 ne fait valider un titre.
   */
  private async applyRequestedTitle(
    conversationId: string,
    toolCalls: LlmToolCall[],
    accessToken: string,
  ): Promise<void> {
    const call = toolCalls.find((toolCall) => toolCall.name === NAME_CONVERSATION.name);
    if (!call) return;

    const title = labelSchema.safeParse(call.input["title"]);
    if (!title.success) {
      console.warn("Appel `name_conversation` sans titre exploitable : renommage ignoré.");
      return;
    }

    await this.conversations.update(conversationId, { title: title.data }, accessToken);
  }

  /**
   * Bascule hors périmètre du canal permanent (A.10).
   *
   * Le modèle ne crée pas la conversation lui-même : il signale que la demande
   * relève du registre conversationnel classique, et le serveur ouvre le fil
   * qui l'accueillera. Ce n'est pas une exception au §12.1 — rien n'est écrit
   * dans les données de l'utilisateur, on choisit seulement où la réponse doit
   * être donnée, ce que le cahier des charges décrit comme automatique.
   */
  private async openRequestedConversation(
    userId: string,
    toolCalls: LlmToolCall[],
    accessToken: string,
  ): Promise<Conversation | null> {
    const call = toolCalls.find((toolCall) => toolCall.name === OPEN_NEW_CONVERSATION.name);
    if (!call) return null;

    const title = labelSchema.safeParse(call.input["title"]);
    if (!title.success) {
      // Sans titre exploitable, on reste dans le canal : ouvrir un fil
      // « Nouvelle conversation » vide serait plus déroutant que de ne rien faire.
      console.warn("Appel `open_new_conversation` sans titre exploitable : bascule ignorée.");
      return null;
    }

    return this.conversations.create(
      userId,
      { title: title.data, folderIds: [] },
      "chat",
      accessToken,
    );
  }
}

/**
 * Consigne système, différenciée selon le registre de la conversation (A.10).
 *
 * Le bornage du canal permanent est appliqué ici, côté serveur, et non dans
 * l'UI : c'est une règle métier, elle doit valoir identiquement pour le web,
 * le mobile et le desktop (§5.3).
 */
function buildSystemPrompt(kind: Conversation["kind"], todo: Housekeeping): string {
  if (kind === "assistant") {
    return [
      "Tu es Jean-Claude, l'assistant d'organisation personnelle de l'utilisateur.",
      "Ce canal est réservé à trois sujets : les rappels (ce qui est important",
      "aujourd'hui ou cette semaine), l'organisation interne de l'outil (dossiers,",
      "rangement, structure), et l'évolution de la structure du projet de l'utilisateur.",
      "",
      "Si la demande sort de ce périmètre, ne la traite pas ici : appelle",
      "`open_new_conversation` avec un titre tiré de la demande, et annonce en une",
      "phrase que tu ouvres cette conversation dédiée. N'y réponds pas toi-même —",
      "la réponse sera donnée là-bas.",
      "",
      "Prends les devants : quand un échange laisse deviner une action à faire,",
      "propose-la plutôt que d'attendre qu'on te la demande. Reste suggestif —",
      "une proposition courte que l'utilisateur accepte ou ignore d'un geste.",
      "",
      "Quand l'échange fait apparaître un besoin de rangement — un projet qui",
      "démarre, un sujet qui revient, un espace mal structuré — appelle",
      "`suggest_project_folders` pour proposer les dossiers correspondants.",
      "L'outil ne crée rien : il affiche une proposition que l'utilisateur",
      "valide. Ne dis donc jamais que les dossiers sont créés, demande.",
    ].join("\n");
  }

  const lines = [
    "Tu es Jean-Claude, un assistant conversationnel personnel.",
    "Réponds de façon utile, directe et naturelle, en français.",
    "",
    "Au fil de l'échange, repère si la conversation produit quelque chose",
    "d'actionnable : une liste de tâches, une liste d'achats, une échéance,",
    "un rendez-vous récurrent. Le cas échéant, appelle l'outil correspondant",
    "pour le proposer — sans interrompre le fil de la conversation, et sans",
    "jamais présenter la chose comme déjà faite : c'est une proposition.",
  ];

  // Exposer l'outil ne suffit pas : sa description est lue au moment de choisir,
  // pas au moment de décider s'il y a lieu de choisir. Les deux gestes
  // d'entretien du fil sont donc demandés explicitement ici.
  if (todo.tools.includes(NAME_CONVERSATION)) {
    lines.push(
      "",
      "Cette conversation n'a pas encore de titre. Dès que l'échange en dit assez",
      "sur son sujet, appelle `name_conversation`. N'attends pas qu'on te le",
      "demande et n'en parle pas : le titre s'applique seul.",
    );
  }

  if (todo.filing) {
    lines.push(
      "",
      "Elle n'est rangée dans aucun dossier. Dès que son sujet est clair, appelle",
      "`suggest_folders` pour proposer où la ranger — tous les dossiers pertinents,",
      "pas seulement un. N'attends pas qu'on te le demande, et ne le fais qu'une fois.",
      "",
      todo.filing.folders.length > 0
        ? "Dossiers existants, à réutiliser en priorité avec leur identifiant exact :"
        : "L'utilisateur n'a encore aucun dossier : propose-en un nouveau, sobrement nommé.",
      ...describeFolders(todo.filing.folders),
    );
  }

  return lines.join("\n");
}

/**
 * Arborescence mise à plat, un dossier par ligne, chemin complet et identifiant.
 *
 * Récursif : l'arborescence descend jusqu'à `MAX_FOLDER_DEPTH` niveaux, et un
 * dossier absent de cette liste est un dossier que le modèle ne peut pas
 * réutiliser — il en rouvrirait un homonyme.
 */
function describeFolders(folders: FolderTreeNode[], path = ""): string[] {
  return folders.flatMap((folder) => {
    const label = path ? `${path} > ${folder.name}` : folder.name;
    return [`- ${label} (${folder.id})`, ...describeFolders(folder.children, label)];
  });
}
