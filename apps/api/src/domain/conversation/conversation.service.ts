import {
  assistantScopeSchema,
  ASSISTANT_MODELS,
  DEFAULT_ASSISTANT_NAME,
  DEFAULT_CONVERSATION_TITLE,
  askedQuestionSchema,
  isVisionCapableModel,
  labelSchema,
  userMemorySchema,
  userPreferencesSchema,
} from "@jc/domain";
import type {
  AskedQuestion,
  AssignFolders,
  AssistantModel,
  AssistantScope,
  CalendarEvent,
  CalendarRange,
  Conversation,
  CreateConversation,
  CursorPagination,
  EditMessage,
  FolderTreeNode,
  Message,
  MessageAttachment,
  MessageStreamEvent,
  Paginated,
  SendMessage,
  Suggestion,
  TaskListWithTasks,
  UpdateConversation,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import type {
  LlmCompletionRequest,
  LlmContentPart,
  LlmMessage,
  LlmProvider,
  LlmTool,
  LlmToolCall,
} from "../../core/llm/llm.port.js";
import { logger } from "../../core/logger.js";
import { parseRelativeDateFr } from "../../core/relative-date.js";
import { fromWall, toWall } from "../../core/timezone.js";
import type { IAttachmentRepository } from "../attachment/attachment.repository.interface.js";
import {
  ASK_QUESTION,
  ASSISTANT_TOOLS,
  CHAT_TOOLS,
  FINISH_ONBOARDING,
  isAllowedByScope,
  NAME_CONVERSATION,
  OPEN_NEW_CONVERSATION,
  SUGGEST_FOLDERS,
  SUGGEST_PROJECT_FOLDERS,
  SUGGEST_TASK_LIST,
  SUGGEST_TASK_LIST_DUE_DATE,
  SUGGEST_TASK_LIST_ITEMS,
} from "../../core/llm/llm.tools.js";
import type { CalendarService } from "../calendar/calendar.service.js";
import type { FolderService } from "../folder/folder.service.js";
import type { SuggestionService } from "../suggestion/suggestion.service.js";
import type { TaskService } from "../task/task.service.js";
import type { IUserRepository } from "../user/user.repository.interface.js";
import type { IConversationRepository } from "./conversation.repository.interface.js";

/** Nombre de messages de contexte envoyés au modèle à chaque tour. */
const CONTEXT_WINDOW_MESSAGES = 40;

/**
 * Profondeur de l'agenda remis au canal permanent.
 *
 * Sept jours parce que le canal couvre « ce qui est important aujourd'hui ou
 * cette semaine » (A.10) : plus loin, la liste devient du bruit dans la consigne.
 */
const AGENDA_WINDOW_DAYS = 7;

/** Propositions rappelées au modèle, des plus récentes aux plus anciennes. */
const RECENT_DECISIONS = 5;

/** Fuseau retenu quand le profil est illisible — celui du schéma partagé. */
const DEFAULT_TIMEZONE = userPreferencesSchema.shape.timezone.parse(undefined);

const SCOPE = "conversation.service";

/**
 * Cadre de rédaction commun aux deux registres.
 *
 * La même réponse s'affiche sur un téléphone et sur un écran large : un modèle
 * laissé libre y déroule des titres et des tableaux là où deux phrases
 * suffisaient. Le Markdown est bien rendu par l'application — c'est son usage
 * systématique qu'on borne, pas sa disponibilité.
 */
const FORMAT_RULES = [
  "",
  "Va au fait : quelques phrases suffisent le plus souvent. Le Markdown est",
  "rendu — titres, listes, tableaux — mais réserve-le à ce qui en a réellement",
  "besoin, la même réponse se lit sur un téléphone.",
];

/**
 * Un appel d'outil ne dispense jamais de répondre (§12.1).
 *
 * Laissé libre, le modèle s'en tient souvent à l'appel : la carte s'affiche et
 * la question posée reste sans réponse. Le service sait rattraper ce cas au
 * prix d'un second appel — cette consigne évite d'en arriver là.
 */
const TOOL_ANSWER_RULE = [
  "",
  "Appeler un outil ne remplace jamais ta réponse : l'outil ne fait qu'afficher",
  "une carte sous le fil. Réponds toujours à l'utilisateur dans le même tour, et",
  "laisse la carte porter la proposition plutôt que de la répéter.",
];

/**
 * Outils que le serveur applique lui-même, et qui ne deviennent donc pas des
 * propositions à valider. Ils ne touchent pas aux données de l'utilisateur :
 * l'un nomme la conversation, l'autre choisit où la réponse sera donnée.
 */
const APPLIED_DIRECTLY = new Set([
  NAME_CONVERSATION.name,
  OPEN_NEW_CONVERSATION.name,
  FINISH_ONBOARDING.name,
  ASK_QUESTION.name,
]);

/**
 * Ce que le tour peut encore faire du fil. `filing` à `null` signifie qu'aucun
 * rangement n'est à proposer — un tableau de dossiers vide, lui, resterait
 * ambigu : l'utilisateur peut n'avoir aucun dossier et attendre le premier.
 */
type Housekeeping = {
  tools: LlmTool[];
  filing: { folders: FolderTreeNode[]; currentFolderIds: string[] } | null;
  /**
   * Ce que le canal permanent doit savoir de l'utilisateur pour proposer juste :
   * ses dossiers, et son agenda proche. `null` partout ailleurs — une
   * conversation classique n'a pas à connaître les rendez-vous de son auteur.
   */
  channel: { folders: FolderTreeNode[]; agenda: CalendarEvent[] } | null;
  /**
   * Todolistes nées de ce fil, avec leur contenu.
   *
   * Sans elles, « complète la liste » n'a rien à désigner : le modèle rappelle
   * l'outil de création et propose une seconde liste homonyme.
   */
  lists: TaskListWithTasks[];
  /** Propositions déjà faites sur ce fil, tranchées ou non (§12.1). */
  decided: Suggestion[];
};

/**
 * Ce que le profil de l'utilisateur dicte au tour de dialogue.
 *
 * Résolu en une lecture : le nom de l'assistant, le périmètre qu'on lui laisse
 * et ce qu'il sait déjà de l'utilisateur décident tous les trois de la consigne
 * système, et les relire séparément multiplierait les allers-retours.
 */
type AssistantContext = {
  /** Nom choisi dans les réglages — « Jean-Claude » n'en est que le défaut. */
  name: string;
  /** Prénom ou pseudo de l'utilisateur, quand il en a choisi un. */
  displayName: string | null;
  /** Fuseau IANA du profil — sans lui, aucune date ne peut être annoncée. */
  timezone: string;
  scope: AssistantScope;
  /** Contexte stable appris à l'accueil puis enrichi (§13.4.2). */
  memory: string | null;
  /** L'accueil n'a pas encore été mené à son terme (§6.3, A.13). */
  onboarding: boolean;
  /** Modèle choisi dans les réglages, ou `null` pour celui du serveur (§5.1). */
  model: AssistantModel | null;
};

/**
 * Annonce d'une bascule vers une conversation dédiée (A.10).
 *
 * Écrite par le serveur et non par le modèle : c'est elle qui porte la
 * validation, et une formulation qui change d'un tour à l'autre ferait douter
 * qu'il s'agisse du même geste. Le modèle, lui, n'écrit rien dans ce cas.
 */
const SWITCH_ANNOUNCEMENT = "Ce sujet mérite une conversation dédiée. On y bascule ?";

/**
 * Premier message du canal permanent, quand l'accueil reste à faire (§6.3).
 *
 * Écrit par le serveur et non improvisé par le modèle : l'utilisateur qui vient
 * de s'inscrire doit trouver une question, pas un fil vide, et cette question
 * ne doit pas dépendre de la disponibilité du moteur. Elle dit aussi que
 * l'étape est facultative — le §6.3 demande un accueil sautable.
 */
function welcomeMessage(assistantName: string): string {
  return (
    `Bonjour, moi c'est ${assistantName}. Avant qu'on se mette au travail, ` +
    "j'aimerais faire connaissance : raconte-moi en quelques mots qui tu es et ce " +
    "qui t'occupe en ce moment, côté pro comme côté perso. Si tu as un projet ou " +
    "une idée en tête, c'est le bon moment pour m'en parler.\n\n" +
    "Rien d'obligatoire : tu peux passer cette étape et y revenir plus tard."
  );
}

export class ConversationService {
  constructor(
    private readonly conversations: IConversationRepository,
    private readonly llm: LlmProvider,
    private readonly suggestions: SuggestionService,
    private readonly folders: FolderService,
    private readonly users: IUserRepository,
    private readonly calendar: CalendarService,
    private readonly tasks: TaskService,
    private readonly attachments: IAttachmentRepository,
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
    const context = await this.contextFor(userId, accessToken);

    const channel =
      existing ??
      (await this.conversations.create(
        userId,
        { title: context.name, folderIds: [] },
        "assistant",
        accessToken,
      ));

    // L'accueil conversationnel démarre ici (§6.3) : le canal est le premier
    // écran de l'utilisateur qui vient de s'inscrire, et il doit y trouver une
    // question plutôt qu'un fil vide.
    //
    // Le fil est vérifié vide plutôt que fraîchement créé : un canal ouvert
    // avant que l'accueil n'existe reste sinon muet pour toujours, alors que
    // l'écran, lui, continue d'annoncer des questions.
    if (context.onboarding && (await this.isEmpty(channel.id, accessToken))) {
      await this.conversations.appendMessage(
        channel.id,
        userId,
        {
          content: welcomeMessage(context.name),
          inputMode: "text",
          role: "assistant",
          attachmentIds: [],
        },
        accessToken,
      );
      // `channel` a été capturé avant ce message : il porte encore le
      // `unreadCount` d'un fil vide. Le relire fait remonter celui que le
      // trigger vient de poser, sans quoi la pastille resterait éteinte à la
      // toute première connexion malgré la question qui attend une réponse.
      return this.getById(channel.id, accessToken);
    }

    return channel;
  }

  /** Aucun message dans le fil — une page d'un seul élément suffit à le dire. */
  private async isEmpty(conversationId: string, accessToken: string): Promise<boolean> {
    const firstPage = await this.conversations.listMessages(conversationId, accessToken, {
      limit: 1,
    });
    return firstPage.items.length === 0;
  }

  update(id: string, patch: UpdateConversation, accessToken: string): Promise<Conversation> {
    return this.conversations.update(id, patch, accessToken);
  }

  async delete(id: string, accessToken: string): Promise<void> {
    await this.getById(id, accessToken);
    await this.conversations.delete(id, accessToken);
  }

  /** Remet le compteur de messages non lus à zéro (pastille de la barre latérale). */
  markRead(id: string, accessToken: string): Promise<Conversation> {
    return this.conversations.markRead(id, accessToken);
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

    // Résolues avant toute écriture : le refus d'un modèle sans vision doit
    // précéder la création du message, pas la suivre (§12.1 — le serveur
    // fait respecter la règle, jamais l'UI seule).
    let attachments: MessageAttachment[] = [];
    if (input.attachmentIds.length > 0) {
      const resolved = await this.attachments.findByIds(input.attachmentIds, accessToken);
      if (resolved.length !== input.attachmentIds.length) {
        throw httpError(404, "Une pièce jointe est introuvable.");
      }
      if (resolved.some((a) => a.messageId !== null)) {
        throw httpError(409, "Une pièce jointe a déjà été envoyée dans un autre message.");
      }
      attachments = resolved;

      const context = await this.contextFor(userId, accessToken);
      this.assertVisionCapable(context.model ?? this.llm.model, attachments);
    }

    const userMessage = await this.conversations.appendMessage(
      conversationId,
      userId,
      { ...input, role: "user" },
      accessToken,
    );

    // Les pièces jointes ne sont pas encore liées en base à cet instant — la
    // liaison ne peut se faire qu'une fois `messageId` connu, juste après.
    // Sans cette fusion manuelle, la vignette apparaîtrait puis disparaîtrait
    // jusqu'au rechargement suivant.
    yield { type: "message", message: { ...userMessage, attachments } };

    if (attachments.length > 0) {
      // Best-effort et journalisée plutôt que propagée (cf. attachment-storage.ts) :
      // les RLS protègent déjà chaque ligne, un échec ne laisse rien d'exposé,
      // seulement une pièce jointe orpheline à revoir plus tard.
      this.attachments
        .linkToMessage(
          attachments.map((a) => a.id),
          userMessage.id,
          accessToken,
        )
        .catch((error: unknown) => {
          logger.error(SCOPE, "Échec de la liaison des pièces jointes au message", error);
        });
    }

    yield* this.generate(conversation, userId, accessToken);
  }

  /**
   * Corrige un message déjà envoyé et rejoue le tour à partir de là.
   *
   * Ce qui suivait répondait au texte d'avant : le conserver ferait un fil qui
   * se contredit. C'est le geste de ChatGPT et de Claude (§4.2) — la
   * correction remplace la question, et la réponse est refaite.
   */
  async *editMessage(
    conversationId: string,
    userId: string,
    messageId: string,
    input: EditMessage,
    accessToken: string,
  ): AsyncGenerator<MessageStreamEvent> {
    const conversation = await this.getById(conversationId, accessToken);
    const message = await this.requireMessage(conversationId, messageId, accessToken);

    if (message.role !== "user") {
      throw httpError(422, "Seul un message que vous avez écrit peut être corrigé.");
    }

    // Couvre le cas où le modèle a changé dans les réglages depuis l'envoi
    // initial : la pièce jointe reste dans l'historique rejoué par `generate`.
    if (message.attachments.length > 0) {
      const context = await this.contextFor(userId, accessToken);
      this.assertVisionCapable(context.model ?? this.llm.model, message.attachments);
    }

    await this.conversations.deleteMessagesAfter(conversationId, message.createdAt, accessToken);
    const corrected = await this.conversations.updateMessageContent(
      messageId,
      input.content,
      accessToken,
    );

    yield { type: "message", message: corrected };

    yield* this.generate(conversation, userId, accessToken);
  }

  /**
   * Redemande une réponse au modèle.
   *
   * Sur une réponse de l'assistant, celle-ci est remplacée et non doublée : on
   * la rejoue parce qu'elle n'allait pas. Sur un message de l'utilisateur, la
   * suite du fil part et le tour repart de sa demande.
   */
  async *retryMessage(
    conversationId: string,
    userId: string,
    messageId: string,
    accessToken: string,
  ): AsyncGenerator<MessageStreamEvent> {
    const conversation = await this.getById(conversationId, accessToken);
    const message = await this.requireMessage(conversationId, messageId, accessToken);

    if (message.role === "system") {
      throw httpError(422, "Ce message ne peut pas être rejoué.");
    }

    // Un message assistant ne porte jamais de pièce jointe : n'a d'effet que
    // sur la reprise d'un message utilisateur.
    if (message.attachments.length > 0) {
      const context = await this.contextFor(userId, accessToken);
      this.assertVisionCapable(context.model ?? this.llm.model, message.attachments);
    }

    await this.conversations.deleteMessagesAfter(conversationId, message.createdAt, accessToken);
    if (message.role === "assistant") {
      await this.conversations.deleteMessage(messageId, accessToken);
    }

    yield* this.generate(conversation, userId, accessToken);
  }

  /**
   * Convertit la conversation en todoliste à la demande de l'utilisateur,
   * plutôt que d'attendre que l'assistant la propose de lui-même (A.2, #17).
   *
   * Un appel dédié au modèle, hors du tour de dialogue ordinaire : rien n'est
   * écrit dans le fil, et un seul outil lui est proposé. Le résultat reste une
   * suggestion en attente comme n'importe quelle autre proposition — déclenchée
   * à la demande ou non, l'assistant propose, il n'exécute pas (§12.1).
   */
  async extractTaskList(
    conversationId: string,
    userId: string,
    accessToken: string,
  ): Promise<Suggestion> {
    const conversation = await this.getById(conversationId, accessToken);
    if (conversation.kind === "assistant") {
      throw httpError(422, "Le canal permanent ne se convertit pas en todoliste.");
    }

    const context = await this.contextFor(userId, accessToken);
    if (!isAllowedByScope(SUGGEST_TASK_LIST.name, context.scope)) {
      throw httpError(403, "La détection de todolistes est désactivée dans les réglages.");
    }

    const history = await this.conversations.listMessages(conversationId, accessToken, {
      limit: CONTEXT_WINDOW_MESSAGES,
    });
    const dialogue = forgetSwitchedAside(history.items).filter((m) => m.role !== "system");

    if (dialogue.length === 0) {
      throw httpError(422, "Il n'y a rien à convertir dans cette conversation.");
    }

    const now = new Date();
    const request: LlmCompletionRequest = {
      system: buildExtractionPrompt(context, now),
      messages: this.toLlmMessages(dialogue),
      tools: [SUGGEST_TASK_LIST],
      ...(context.model ? { model: context.model } : {}),
    };

    const toolCalls: LlmToolCall[] = [];
    for await (const chunk of this.llm.stream(request)) {
      if (chunk.type === "tool_call") toolCalls.push(chunk.toolCall);
    }

    // Le modèle peut fragmenter la proposition en plusieurs appels séparés au
    // lieu d'un seul portant plusieurs entrées dans `lists`, comme la
    // consigne le demande : les regrouper évite d'en perdre au-delà du
    // premier.
    const call = mergeTaskListCalls(toolCalls);
    // Même filet que le tour de dialogue ordinaire : sans lui, une échéance
    // extraite ici échapperait à la correction de date (A.3, #18).
    const corrected = call ? withCorrectedDueDates(call, now, context.timezone) : null;
    const suggestion = corrected
      ? await this.suggestions.capture(userId, conversationId, corrected, accessToken)
      : null;

    if (!suggestion) {
      throw httpError(422, "Aucune todoliste n'a pu être extraite de cette conversation.");
    }

    return suggestion;
  }

  /**
   * Ouvre la conversation dédiée que le canal permanent a proposée (A.10).
   *
   * Rien n'est ouvert tant que l'utilisateur n'a pas validé : le canal propose,
   * il n'exécute pas (§12.1). La validation faite, l'échange sort du contexte
   * du canal — la réponse se donne dans l'autre fil, et la relire ici ferait
   * revenir le modèle sur un sujet dont il vient de se dessaisir.
   */
  async switchToDedicatedConversation(
    conversationId: string,
    userId: string,
    messageId: string,
    accessToken: string,
  ): Promise<Conversation> {
    await this.getById(conversationId, accessToken);
    const message = await this.requireMessage(conversationId, messageId, accessToken);

    if (message.redirectTitle === null) {
      throw httpError(422, "Ce message ne propose pas de conversation dédiée.");
    }
    if (message.redirectAcceptedAt !== null) {
      throw httpError(409, "Cette conversation a déjà été ouverte.");
    }

    const conversation = await this.conversations.create(
      userId,
      { title: message.redirectTitle, folderIds: [] },
      "chat",
      accessToken,
    );

    await this.conversations.acceptRedirect(messageId, accessToken);

    return conversation;
  }

  /**
   * Traduit le fil vers le format du port LLM.
   *
   * Un message sans pièce jointe garde la simple chaîne d'avant — inutile
   * d'imposer un tableau à un tour de dialogue qui n'en a jamais eu besoin.
   *
   * Un PDF ou un fichier texte ne devient jamais une partie `image` (§13.4.1) :
   * son texte, déjà extrait à l'upload, rejoint le texte du message dans la
   * même partie `text` — avant les images, pour que le modèle lise le
   * contexte écrit avant de regarder ce qui l'illustre.
   */
  private toLlmMessages(dialogue: Message[]): LlmMessage[] {
    return dialogue.map((m) => {
      if (m.attachments.length === 0) {
        return { role: m.role as "user" | "assistant", content: m.content };
      }

      const parts: LlmContentPart[] = [];
      const textSections = [
        ...(m.content.length > 0 ? [m.content] : []),
        ...m.attachments
          .filter((a) => a.extractedText !== null)
          .map((a) => `--- ${a.fileName} ---\n${a.extractedText}`),
      ];
      if (textSections.length > 0) {
        parts.push({ type: "text", text: textSections.join("\n\n") });
      }
      parts.push(
        ...m.attachments
          .filter((a) => a.mimeType.startsWith("image/"))
          .map((a) => ({ type: "image" as const, url: a.url, mediaType: a.mimeType })),
      );

      return { role: m.role as "user" | "assistant", content: parts };
    });
  }

  /**
   * Refuse une image que le modèle actif ne peut pas lire (§12.1 — le
   * serveur fait respecter la règle). Un PDF ou un fichier texte n'entre pas
   * dans ce compte : son texte extrait se lit avec n'importe quel modèle,
   * aucun besoin de vision.
   */
  private assertVisionCapable(model: string, attachments: MessageAttachment[]): void {
    const images = attachments.filter((a) => a.mimeType.startsWith("image/"));
    if (images.length === 0 || isVisionCapableModel(model)) return;

    const label = ASSISTANT_MODELS.find((m) => m.id === model)?.label ?? model;
    throw httpError(
      422,
      `${label} ne peut pas lire les images. Changez de modèle dans les réglages ou retirez les pièces jointes.`,
    );
  }

  private async requireMessage(
    conversationId: string,
    messageId: string,
    accessToken: string,
  ): Promise<Message> {
    const message = await this.conversations.findMessage(messageId, accessToken);
    // Le rattachement est vérifié ici et non par les RLS : un message d'une
    // autre conversation du même utilisateur passerait sinon sans bruit.
    if (!message || message.conversationId !== conversationId) {
      throw httpError(404, "Message introuvable.");
    }
    return message;
  }

  /**
   * Interroge le modèle sur l'état courant du fil et persiste sa réponse.
   *
   * Partagé par l'envoi, la correction et la reprise : ces trois gestes ne
   * diffèrent que par ce qu'ils font du fil *avant* d'appeler le modèle.
   */
  private async *generate(
    conversation: Conversation,
    userId: string,
    accessToken: string,
  ): AsyncGenerator<MessageStreamEvent> {
    const conversationId = conversation.id;

    // Instant du tour, pris une fois : la fenêtre d'agenda et le repère
    // temporel de la consigne doivent désigner le même moment.
    const now = new Date();

    // Fil et profil partent ensemble : ils ne dépendent pas l'un de l'autre, et
    // les enchaîner allongeait d'autant l'attente avant le premier mot.
    const [history, context] = await Promise.all([
      this.conversations.listMessages(conversationId, accessToken, {
        limit: CONTEXT_WINDOW_MESSAGES,
      }),
      this.contextFor(userId, accessToken),
    ]);

    // Les messages `system` stockés ne sont pas rejouables comme des tours de
    // dialogue : la consigne système est reconstruite à chaque appel.
    const dialogue = forgetSwitchedAside(history.items).filter((m) => m.role !== "system");

    // Une reprise sur le tout premier message le retirerait sans rien laisser
    // à quoi répondre : mieux vaut le dire que d'appeler le modèle à vide.
    if (dialogue.length === 0) {
      throw httpError(422, "Il n'y a rien à quoi répondre dans cette conversation.");
    }

    let text = "";
    let provider: string | null = null;
    let model: string | null = null;
    const toolCalls: LlmToolCall[] = [];
    let assistantMessage: Message | null = null;
    // Une suggestion capturée est déjà une carte à l'écran : ça compte comme
    // une réponse du tour, même sans le moindre mot de texte.
    let suggestionCaptured = false;

    // Entretien du fil : résolu avant l'appel au modèle, parce qu'il décide des
    // outils qu'on lui expose — et il se lit à partir du profil.
    const todo = await this.pendingHousekeeping(conversation, context, now, accessToken);

    const request: LlmCompletionRequest = {
      system: buildSystemPrompt(conversation.kind, todo, context, now),
      messages: this.toLlmMessages(dialogue),
      tools: todo.tools,
      // Le modèle du profil ne remplace celui du serveur que s'il existe :
      // `null` veut dire « celui que le serveur a retenu », et non « aucun ».
      ...(context.model ? { model: context.model } : {}),
    };

    try {
      for await (const chunk of this.llm.stream(request)) {
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

      // Le modèle s'en tient parfois à l'appel d'outil, sans un mot pour
      // l'utilisateur : la carte s'affiche, et la question posée reste sans
      // réponse. Un second tour la lui donne, la consigne n'ayant pas suffi.
      if (text.length === 0 && needsWrittenAnswer(conversation.kind, toolCalls)) {
        for await (const chunk of this.answerAfterToolCall(request, toolCalls)) {
          text += chunk;
          yield { type: "text", text: chunk };
        }
      }
    } finally {
      // `finally` et non la sortie nominale : si le client se déconnecte en
      // pleine génération, le texte déjà produit est déjà facturé. Le perdre
      // priverait l'utilisateur d'une réponse qu'il retrouverait de toute façon
      // au rechargement.
      // Résolu avant l'écriture : les réponses proposées voyagent sur le
      // message qui porte la question, pas dans une seconde requête.
      const asked = readQuestion(toolCalls);
      // La bascule prime sur tout ce que le modèle a pu écrire : l'annonce doit
      // être la même à chaque fois, puisque c'est elle qui porte la validation.
      const redirectTitle = readRedirectTitle(conversation.kind, toolCalls);
      const content = redirectTitle
        ? SWITCH_ANNOUNCEMENT
        : text.length > 0
          ? text
          : (asked?.question ?? "");

      assistantMessage =
        content.length > 0
          ? await this.conversations.appendMessage(
              conversationId,
              userId,
              {
                content,
                inputMode: "text",
                role: "assistant",
                attachmentIds: [],
                provider,
                model,
                ...(asked && !redirectTitle ? { choices: asked.choices } : {}),
                ...(redirectTitle ? { redirectTitle } : {}),
              },
              accessToken,
            )
          : null;

      // Écrites avant le dernier `yield`, et non après : rien n'oblige
      // l'appelant à consommer cet événement, et le code qui le suivrait ne
      // s'exécuterait alors jamais. Une proposition perdue ici le serait
      // définitivement — le modèle ne sera pas rejoué.
      for (const toolCall of toolCalls) {
        if (APPLIED_DIRECTLY.has(toolCall.name)) continue;
        // Retirer l'outil du jeu remis au modèle suffit en pratique, mais rien
        // ne garantit qu'il n'en nommera pas un autre. Une capacité coupée dans
        // les réglages ne doit produire aucune suggestion, quel que soit le
        // chemin par lequel l'appel arrive (A.10).
        if (!isAllowedByScope(toolCall.name, context.scope)) {
          logger.warn(SCOPE, `Appel d'outil hors du périmètre autorisé, ignoré : ${toolCall.name}`);
          continue;
        }
        try {
          const corrected = withCorrectedRescheduleDueDate(
            withCorrectedDueDates(
              withVerifiedFolders(toolCall, todo.filing?.folders ?? []),
              now,
              context.timezone,
            ),
            now,
            context.timezone,
          );
          await this.suggestions.capture(userId, conversationId, corrected, accessToken);
          suggestionCaptured = true;
        } catch (error) {
          // Une capture ne doit jamais faire perdre les suivantes : sans cet
          // isolement, l'échec d'un seul appel d'outil (ex. une nature de
          // suggestion que la contrainte de la table ne reconnaît pas encore)
          // coupait la boucle et emportait avec lui les propositions du même
          // tour qui restaient à capturer.
          logger.error(
            SCOPE,
            `Capture de suggestion \`${toolCall.name}\` impossible :`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      await this.applyRequestedTitle(conversationId, toolCalls, accessToken);

      await this.applyOnboardingMemory(userId, toolCalls, accessToken);

      if (assistantMessage) yield { type: "done", message: assistantMessage };
    }

    // Le modèle a pu répondre sans lever d'erreur technique et pourtant ne
    // rien produire d'exploitable (ex. un moteur qui ne rend aucun appel
    // d'outil, cf. Sonar) : sans ce garde-fou, le tour se clôt sans un mot ni
    // une carte, et l'utilisateur ne sait même pas que sa demande a été reçue.
    if (!assistantMessage && !suggestionCaptured) {
      throw httpError(
        502,
        "Le modèle n'a produit aucune réponse. Réessayez, ou changez de modèle dans Réglages.",
      );
    }
  }

  /**
   * Second tour, quand le premier n'a produit qu'un appel d'outil.
   *
   * Sans lui, la demande de l'utilisateur reste sans réponse : le fil n'affiche
   * qu'une carte, et rien ne dit ce qui a été compris. Le rattrapage est rendu
   * en flux comme la réponse ordinaire — c'en est une, arrivée en deux temps.
   *
   * Aucun outil n'est remis au modèle : la proposition du premier tour sera
   * captée de toute façon, et la rejouer afficherait deux cartes pour un seul
   * geste. Un échec est consigné puis abandonné — le tour reste exploitable
   * sans ce second texte, alors que le faire échouer perdrait la proposition
   * avec lui.
   */
  private async *answerAfterToolCall(
    request: LlmCompletionRequest,
    toolCalls: LlmToolCall[],
  ): AsyncGenerator<string> {
    logger.warn(SCOPE, "Tour sans réponse écrite : second appel pour répondre à l'utilisateur.");

    try {
      const stream = this.llm.stream({
        ...request,
        system: [request.system ?? "", "", proposalReminder(toolCalls)].join("\n"),
        tools: [],
      });

      for await (const chunk of stream) {
        if (chunk.type === "text") yield chunk.text;
      }
    } catch (error) {
      logger.error(
        SCOPE,
        "Rattrapage de réponse impossible :",
        error instanceof Error ? error.message : error,
      );
    }
  }

  /**
   * Réglages et mémoire de l'utilisateur, tels que le tour de dialogue les lit.
   *
   * Un profil illisible retombe sur les valeurs par défaut plutôt que de faire
   * échouer le tour : c'est ce que voit un compte qui n'a jamais ouvert ses
   * réglages, donc le plus proche de ce que l'utilisateur attend. L'accueil est
   * alors réputé fait — mieux vaut manquer une conversation d'accueil que la
   * rejouer indéfiniment à chaque message.
   */
  private async contextFor(userId: string, accessToken: string): Promise<AssistantContext> {
    const profile = await this.users.findById(userId, accessToken);

    if (!profile) {
      logger.warn(SCOPE, "Profil introuvable au moment de borner l'assistant : réglages par défaut.");
      return {
        name: DEFAULT_ASSISTANT_NAME,
        displayName: null,
        timezone: DEFAULT_TIMEZONE,
        scope: assistantScopeSchema.parse({}),
        memory: null,
        onboarding: false,
        model: null,
      };
    }

    return {
      name: profile.preferences.assistantName,
      displayName: profile.displayName,
      timezone: profile.preferences.timezone,
      scope: profile.preferences.scope,
      memory: profile.memory,
      onboarding: profile.onboardingCompletedAt === null,
      model: profile.preferences.llmModel,
    };
  }

  /**
   * Outils du tour, et ce qu'il faut injecter dans la consigne pour que le
   * modèle propose juste.
   *
   * Le canal permanent a son propre jeu (A.10) et reçoit en plus l'agenda
   * proche — il annonce les rappels comme premier de ses trois sujets, et sans
   * cette lecture il ne pourrait qu'inventer. Une conversation classique reçoit
   * de quoi se nommer tant qu'elle porte le titre par défaut, et de quoi se
   * ranger — d'office tant qu'elle n'est dans aucun dossier, sur demande
   * explicite une fois classée (§12.1).
   *
   * Dans les deux registres, une proposition qui attend déjà une réponse retire
   * l'outil correspondant du jeu : la relancer à chaque message empilerait les
   * cartes sur un geste que l'utilisateur a laissé venir.
   *
   * Le périmètre s'applique en amont de tout le reste : un outil dont la
   * capacité est désactivée n'entre pas dans le jeu, et la consigne cesse du
   * même coup de le réclamer.
   */
  private async pendingHousekeeping(
    conversation: Conversation,
    context: AssistantContext,
    now: Date,
    accessToken: string,
  ): Promise<Housekeeping> {
    const scope = context.scope;

    if (conversation.kind === "assistant") {
      const tools = allowed(ASSISTANT_TOOLS, scope);

      // L'accueil se déroule dans le canal permanent : tant qu'il n'est pas
      // clos, le modèle doit pouvoir le clore lui-même. Ni l'agenda ni les
      // dossiers n'y ont leur place — le compte vient d'être créé, les deux
      // sont vides, et la consigne d'accueil doit rester une conversation.
      if (context.onboarding) {
        tools.push(FINISH_ONBOARDING);
        return { tools, filing: null, channel: null, lists: [], decided: [] };
      }

      // Les trois lectures partent ensemble : les enchaîner ajoutait deux
      // allers-retours de base au délai qui précède le premier mot de la
      // réponse, alors qu'aucune ne dépend du résultat des autres.
      const [decided, tree, agenda] = await Promise.all([
        this.suggestions.listForConversation(conversation.id, accessToken),
        this.folders.getTree(accessToken),
        this.calendar.list(agendaWindow(now), accessToken),
      ]);

      const structuring = isPending(decided, "create_project_folders")
        ? tools.filter((tool) => tool !== SUGGEST_PROJECT_FOLDERS)
        : tools;

      // L'arborescence n'est remise au modèle que s'il peut en proposer une :
      // sans l'outil, elle ne ferait qu'allonger la consigne.
      const folders = structuring.includes(SUGGEST_PROJECT_FOLDERS) ? tree : [];

      return { tools: structuring, filing: null, channel: { folders, agenda }, lists: [], decided };
    }

    // Autorisé tant que la capacité reste active — classé ou non : une
    // conversation déjà rangée doit pouvoir être reclassée sur demande
    // explicite (§12.1), pas seulement lors de son premier rangement.
    const mayFile = scope.folderOrganization;

    const [decided, tree, lists] = await Promise.all([
      this.suggestions.listForConversation(conversation.id, accessToken),
      mayFile ? this.folders.getTree(accessToken) : Promise.resolve<FolderTreeNode[]>([]),
      // Les listes nées de ce fil, pour que « complète la liste » ait de quoi
      // désigner celle dont on parle plutôt qu'une seconde à créer.
      this.tasks.listForConversation(conversation.id, accessToken),
    ]);

    const tools = allowed(CHAT_TOOLS, scope).filter(
      (tool) =>
        // `SUGGEST_FOLDERS` n'est rendu qu'aux conversations non classées : il
        // n'a rien à proposer sur un fil déjà rangé.
        tool !== SUGGEST_FOLDERS &&
        // Une todoliste déjà proposée attend un geste : la reproposer
        // empilerait deux cartes pour la même chose, ce que le « non intrusif »
        // du §12.1 exclut.
        !(tool === SUGGEST_TASK_LIST && isPending(decided, "create_task_list")) &&
        // Compléter suppose qu'il y ait quelque chose à compléter : sans liste
        // sur ce fil, l'outil n'aurait aucun identifiant à recevoir et le
        // modèle en inventerait un.
        !(
          tool === SUGGEST_TASK_LIST_ITEMS &&
          (lists.length === 0 || isPending(decided, "add_task_list_items"))
        ) &&
        // Même garde-fou pour la reprogrammation : rien à décaler sans liste
        // née de ce fil, et une reprogrammation déjà proposée attend une
        // réponse avant d'en empiler une seconde.
        !(
          tool === SUGGEST_TASK_LIST_DUE_DATE &&
          (lists.length === 0 || isPending(decided, "update_task_list_due_date"))
        ),
    );

    if (conversation.title === DEFAULT_CONVERSATION_TITLE) tools.push(NAME_CONVERSATION);

    if (!mayFile || isPending(decided, "assign_folders")) {
      return { tools, filing: null, channel: null, lists, decided };
    }

    tools.push(SUGGEST_FOLDERS);
    return {
      tools,
      filing: { folders: tree, currentFolderIds: conversation.folderIds },
      channel: null,
      lists,
      decided,
    };
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
      logger.warn(SCOPE, "Appel `name_conversation` sans titre exploitable : renommage ignoré.");
      return;
    }

    await this.conversations.update(conversationId, { title: title.data }, accessToken);
  }

  /**
   * Clôt l'accueil et enregistre ce qu'il a appris (§6.3, A.13).
   *
   * Appliqué directement, comme le titre : rien n'est créé dans les données de
   * l'utilisateur, on note ce qu'il vient de raconter de lui-même. Le faire
   * valider reviendrait à lui demander de confirmer ses propres réponses.
   *
   * Un échec d'écriture n'interrompt pas le tour : la réponse est déjà partie,
   * et l'accueil se rejouera au message suivant — moins gênant que de perdre
   * l'échange en cours.
   */
  private async applyOnboardingMemory(
    userId: string,
    toolCalls: LlmToolCall[],
    accessToken: string,
  ): Promise<void> {
    const call = toolCalls.find((toolCall) => toolCall.name === FINISH_ONBOARDING.name);
    if (!call) return;

    const memory = userMemorySchema.safeParse(call.input["memory"]);
    if (!memory.success) {
      logger.warn(SCOPE, "Appel `finish_onboarding` sans mémoire exploitable : accueil non clos.");
      return;
    }

    try {
      await this.users.completeOnboarding(userId, memory.data, accessToken);
    } catch (error) {
      logger.error(
        SCOPE,
        "Clôture de l'accueil impossible :",
        error instanceof Error ? error.message : error,
      );
    }
  }
}

/**
 * Titre de la conversation dédiée que le tour propose d'ouvrir (A.10).
 *
 * `null` hors du canal permanent : l'outil n'y est pas proposé, et un appel
 * égaré remplacerait une réponse légitime par l'annonce de bascule.
 *
 * Sans titre exploitable, on reste dans le canal : proposer d'ouvrir un fil
 * « Nouvelle conversation » vide serait plus déroutant que de ne rien faire.
 */
function readRedirectTitle(kind: Conversation["kind"], toolCalls: LlmToolCall[]): string | null {
  if (kind !== "assistant") return null;

  const call = toolCalls.find((toolCall) => toolCall.name === OPEN_NEW_CONVERSATION.name);
  if (!call) return null;

  const title = labelSchema.safeParse(call.input["title"]);
  if (!title.success) {
    logger.warn(SCOPE, "Appel `open_new_conversation` sans titre exploitable : bascule ignorée.");
    return null;
  }

  return title.data;
}

/**
 * Vérifie les dossiers d'un `suggest_folders` avant d'en faire une proposition.
 *
 * Le modèle rend un identifiant **et** le nom lu sur la même ligne de la
 * consigne : seules les paires cohérentes sont retenues. Un identifiant recopié
 * de travers tombe sur un autre dossier réel de l'utilisateur — la proposition
 * paraît alors sensée alors qu'elle range la conversation dans un dossier
 * étranger au sujet, et rien en aval ne peut le détecter. C'est le seul endroit
 * où les deux informations sont connues ensemble.
 *
 * Deux champs vérifiés indépendamment : `existingFolders`, traduit vers
 * `existingFolderIds`, la forme que la charge utile persistée porte depuis le
 * début ; et le `parent` de chaque nouveau dossier, qui suit la même règle
 * puisqu'il désigne lui aussi un dossier existant.
 */
function withVerifiedFolders(toolCall: LlmToolCall, known: FolderTreeNode[]): LlmToolCall {
  if (toolCall.name !== SUGGEST_FOLDERS.name) return toolCall;

  const folders = flattenWithPath(known);
  const input = { ...toolCall.input };

  const existingProposed = toolCall.input["existingFolders"];
  // Le modèle s'en est tenu aux nouveaux dossiers, ou a répondu dans l'ancienne
  // forme : la capture sait déjà écarter un identifiant qui n'est pas un UUID.
  if (Array.isArray(existingProposed)) {
    input["existingFolderIds"] = existingProposed.flatMap((entry) => {
      const folder = matchProposedFolder(entry, folders);
      return folder ? [folder.id] : [];
    });
  }

  const newProposed = toolCall.input["newFolders"];
  if (Array.isArray(newProposed)) {
    input["newFolders"] = newProposed.flatMap((entry) => verifyNewFolder(entry, folders));
  }

  return { ...toolCall, input };
}

/**
 * Un dossier proposé — dossier existant à réutiliser, ou parent d'un nouveau
 * dossier — vérifié contre l'arborescence connue.
 */
function matchProposedFolder(
  entry: unknown,
  known: { id: string; name: string; path: string }[],
): { id: string; name: string; path: string } | null {
  const candidate = readProposedFolder(entry);
  if (!candidate) {
    logger.warn(SCOPE, "Dossier proposé sans identifiant ni nom exploitables, écarté.");
    return null;
  }

  const folder = known.find((candidateFolder) => candidateFolder.id === candidate.id);
  if (!folder) {
    logger.warn(SCOPE, "Dossier proposé inconnu, écarté du rangement.");
    return null;
  }

  // Le chemin complet est accepté au même titre que le nom seul : la consigne
  // affiche « Administratif > Assurances », et reprendre la ligne entière est
  // une lecture fidèle, pas une confusion.
  if (!sameName(folder.name, candidate.name) && !sameName(folder.path, candidate.name)) {
    logger.warn(SCOPE, "Dossier proposé dont le nom contredit l'identifiant, écarté.");
    return null;
  }

  return folder;
}

/**
 * Un nouveau dossier proposé, son `parent` vérifié quand il en porte un.
 *
 * Un parent introuvable ne fait pas perdre le nouveau dossier lui-même : il
 * naît alors à la racine plutôt que de faire échouer toute la proposition
 * pour une seule ligne mal recopiée.
 */
function verifyNewFolder(
  entry: unknown,
  known: { id: string; name: string; path: string }[],
): { name: string; parentId?: string }[] {
  if (typeof entry !== "object" || entry === null || !("name" in entry)) return [];

  const { name } = entry as Record<string, unknown>;
  if (typeof name !== "string") return [];

  const parent = (entry as Record<string, unknown>)["parent"];
  if (parent === undefined) return [{ name }];

  const folder = matchProposedFolder(parent, known);
  return [folder ? { name, parentId: folder.id } : { name }];
}

/**
 * Regroupe en un seul appel les éventuels appels `suggest_task_list` multiples
 * d'un même tour.
 *
 * La consigne demande une entrée par liste dans un unique appel, mais rien
 * n'empêche le modèle de répondre par plusieurs appels séparés à la place —
 * ne garder que le premier (`toolCalls.find`) en perdrait alors le reste.
 */
function mergeTaskListCalls(toolCalls: LlmToolCall[]): LlmToolCall | null {
  const calls = toolCalls.filter((toolCall) => toolCall.name === SUGGEST_TASK_LIST.name);
  const first = calls[0];
  if (!first) return null;
  if (calls.length === 1) return first;

  const lists = calls.flatMap((call) => {
    const entries = call.input["lists"];
    return Array.isArray(entries) ? entries : [];
  });

  return { ...first, input: { ...first.input, lists } };
}

/**
 * `text` au format `HH:mm` (24 h), vers heure et minute — `null` si le format
 * ou les bornes ne correspondent pas, ex. une hallucination du modèle.
 */
function parseWallTime(text: string): { hours: number; minutes: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text.trim());
  if (!match || match[1] === undefined || match[2] === undefined) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

/** Pose une heure murale sur le jour mural que porte `dayIso`. */
function withWallTime(
  dayIso: string,
  time: { hours: number; minutes: number },
  timeZone: string,
): string {
  const wall = toWall(new Date(dayIso), timeZone);
  const wallMs = Date.UTC(
    wall.getUTCFullYear(),
    wall.getUTCMonth(),
    wall.getUTCDate(),
    time.hours,
    time.minutes,
  );
  return fromWall(wallMs, timeZone).toISOString();
}

/**
 * Échéance à retenir entre le calcul du modèle et les deux filets
 * déterministes (A.3, #18).
 *
 * Le jour vient du filet de date relative quand `dueAtText` est reconnu avec
 * certitude — plus fiable que l'arithmétique du modèle sur les jours de la
 * semaine —, sinon du calcul du modèle tel quel. L'heure, elle, ne vient
 * jamais d'une lecture de `dueAt` : un modèle qui se trompe de fuseau y pose
 * parfois une heure qui n'est ni minuit ni une heure demandée, et la prendre
 * pour une heure volontaire créerait de faux rendez-vous. Elle ne vient donc
 * que de `dueTime`, rempli uniquement quand l'utilisateur en a donné une
 * (« à 10h ») — absent, l'échéance reste à minuit, comme avant ce champ.
 */
function resolveDueAt(
  dueAtText: unknown,
  rawDueAt: unknown,
  dueTime: unknown,
  now: Date,
  timezone: string,
): string | null {
  const parsedDate =
    typeof dueAtText === "string" ? parseRelativeDateFr(dueAtText, now, timezone) : null;
  const day = parsedDate ?? (typeof rawDueAt === "string" ? rawDueAt : null);
  if (day === null) return null;

  const time = typeof dueTime === "string" ? parseWallTime(dueTime) : null;
  return time !== null ? withWallTime(day, time, timezone) : truncateToMidnight(day, timezone);
}

/**
 * Corrige les échéances d'un `suggest_task_list` avant capture (A.3, #18).
 *
 * Le modèle calcule déjà `dueAt` lui-même, mais se trompe parfois dans
 * l'arithmétique des jours de la semaine. Quand il a aussi recopié
 * l'expression source (`dueAtText`) et qu'elle est reconnue avec certitude,
 * le calcul déterministe du serveur remplace le sien (`resolveDueAt`).
 *
 * Une échéance qui retombe malgré tout dans le passé est effacée plutôt que
 * gardée telle quelle : une todoliste proposée par l'assistant est toujours à
 * faire, jamais déjà en retard le jour de sa création. Perdre l'échéance
 * coûte moins cher que perdre la liste entière (§12.1) — c'est déjà la
 * philosophie retenue pour une date illisible.
 */
function withCorrectedDueDates(toolCall: LlmToolCall, now: Date, timezone: string): LlmToolCall {
  if (toolCall.name !== SUGGEST_TASK_LIST.name) return toolCall;

  const lists = toolCall.input["lists"];
  if (!Array.isArray(lists)) return toolCall;

  const corrected = lists.map((entry) => {
    if (typeof entry !== "object" || entry === null) return entry;

    const record = entry as Record<string, unknown>;
    const dueAt = resolveDueAt(
      record["dueAtText"],
      record["dueAt"],
      record["dueTime"],
      now,
      timezone,
    );
    if (dueAt === null) return entry;

    if (isPastDay(dueAt, now, timezone)) {
      logger.warn(SCOPE, "Échéance de todoliste proposée dans le passé, effacée.");
      return { ...entry, dueAt: null };
    }

    return { ...entry, dueAt };
  });

  return { ...toolCall, input: { ...toolCall.input, lists: corrected } };
}

/**
 * Corrige l'échéance d'un `suggest_task_list_due_date` avant capture (A.2).
 *
 * Même filet que pour la création (`resolveDueAt`) — expression relative
 * fiabilisée, heure reprise de `dueTime` quand l'utilisateur en a donné une —
 * mais une échéance dans le passé n'y est pas effaçable : contrairement à la
 * création d'une liste, l'outil n'a rien à proposer d'autre qu'une nouvelle
 * date. Le champ est retiré, ce qui fait échouer la validation du schéma en
 * aval et abandonne la proposition entière plutôt que de reprogrammer une
 * liste dans le passé (§12.1).
 */
function withCorrectedRescheduleDueDate(
  toolCall: LlmToolCall,
  now: Date,
  timezone: string,
): LlmToolCall {
  if (toolCall.name !== SUGGEST_TASK_LIST_DUE_DATE.name) return toolCall;

  const dueAt = resolveDueAt(
    toolCall.input["dueAtText"],
    toolCall.input["dueAt"],
    toolCall.input["dueTime"],
    now,
    timezone,
  );

  const input = { ...toolCall.input };
  if (dueAt === null || isPastDay(dueAt, now, timezone)) {
    if (dueAt !== null) {
      logger.warn(SCOPE, "Reprogrammation de todoliste dans le passé, proposition abandonnée.");
    }
    delete input["dueAt"];
  } else {
    input["dueAt"] = dueAt;
  }

  return { ...toolCall, input };
}

/**
 * Le jour porté par `iso` (dans le fuseau du profil) est-il déjà passé ?
 *
 * Comparaison de jours calendaires, pas d'instants : aujourd'hui reste
 * valide même une fois son heure courante dépassée — une todoliste ne porte
 * jamais d'horaire, seulement un jour (§12.1).
 */
function isPastDay(iso: string, now: Date, timeZone: string): boolean {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return false;

  const today = toWall(now, timeZone);
  const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  const wall = toWall(instant, timeZone);
  const targetMs = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());

  return targetMs < todayMs;
}

/**
 * Minuit du même jour mural que `iso`, dans le fuseau donné.
 *
 * `null` si `iso` est illisible — la valeur du modèle reste alors telle
 * quelle, un filet qui invente est pire qu'un filet absent.
 */
function truncateToMidnight(iso: string, timeZone: string): string | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;

  const wall = toWall(instant, timeZone);
  const midnightWallMs = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  return fromWall(midnightWallMs, timeZone).toISOString();
}

/** Un dossier tel que le modèle le rend, ou `null` si la forme n'y est pas. */
function readProposedFolder(entry: unknown): { id: string; name: string } | null {
  if (typeof entry !== "object" || entry === null) return null;
  if (!("id" in entry) || !("name" in entry)) return null;

  const { id, name } = entry;
  return typeof id === "string" && typeof name === "string" ? { id, name } : null;
}

/** Arborescence mise à plat, chaque dossier portant aussi son chemin complet. */
function flattenWithPath(
  tree: FolderTreeNode[],
  parent = "",
): { id: string; name: string; path: string }[] {
  return tree.flatMap((folder) => {
    const path = parent ? `${parent} > ${folder.name}` : folder.name;
    return [
      { id: folder.id, name: folder.name, path },
      ...flattenWithPath(folder.children, path),
    ];
  });
}

/**
 * Deux noms de dossier ne différant que par la casse ou les espaces de bord
 * désignent le même dossier — c'est ainsi que l'utilisateur les lit.
 */
function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("fr") === b.trim().toLocaleLowerCase("fr");
}

/**
 * Le tour doit-il encore produire une réponse écrite ?
 *
 * Deux appels se suffisent à eux-mêmes : `open_new_conversation` exige au
 * contraire qu'aucun texte ne soit écrit — l'annonce de bascule vient du
 * serveur — et `ask_question` porte déjà sa question, affichée telle quelle à
 * défaut de texte. Partout ailleurs, une carte sans un mot laisse l'utilisateur
 * devant une proposition qui ne répond pas à ce qu'il vient de demander.
 *
 * Un tour sans le moindre appel d'outil n'est pas rattrapé : le modèle n'a
 * alors rien produit du tout, et le rejouer à l'identique donnerait le même
 * silence.
 */
function needsWrittenAnswer(kind: Conversation["kind"], toolCalls: LlmToolCall[]): boolean {
  if (toolCalls.length === 0) return false;
  if (readRedirectTitle(kind, toolCalls) !== null) return false;
  return readQuestion(toolCalls) === null;
}

/**
 * Ce que le second tour doit savoir du premier.
 *
 * Le modèle ne relit pas ses propres appels d'outils : sans ce rappel, il
 * reformulerait en clair une proposition que la carte affiche déjà, ou la
 * présenterait comme faite — l'inverse du §12.1.
 */
function proposalReminder(toolCalls: LlmToolCall[]): string {
  const proposed = toolCalls
    .map((toolCall) => toolCall.input["message"])
    .filter((message): message is string => typeof message === "string" && message.length > 0);

  const lines = [
    "Tu viens d'appeler un outil sans écrire un mot : la demande de l'utilisateur",
    "reste sans réponse. Réponds-y maintenant, en texte et sans appeler d'outil.",
  ];

  if (proposed.length > 0) {
    lines.push(
      "",
      "Une carte affiche déjà la proposition ci-dessous, avec de quoi l'accepter ou",
      "l'ignorer. N'y reviens pas, ne la répète pas, ne la présente pas comme faite :",
      ...proposed.map((message) => `- « ${message} »`),
    );
  }

  return lines.join("\n");
}

/**
 * Retire du contexte l'échange déjà basculé vers une conversation dédiée (A.10).
 *
 * Deux messages partent : l'annonce validée, et la demande qui l'a provoquée.
 * La réponse est donnée dans l'autre fil ; les relire ici ferait revenir le
 * canal sur un sujet dont il vient justement de se dessaisir, et ce qu'il en
 * dirait ferait doublon avec ce qui s'écrit là-bas.
 */
function forgetSwitchedAside(messages: Message[]): Message[] {
  return messages.filter((message, index) => {
    if (message.redirectAcceptedAt !== null) return false;

    const next = messages[index + 1];
    const precedesSwitch =
      message.role === "user" && next !== undefined && next.redirectAcceptedAt !== null;

    return !precedesSwitch;
  });
}

/**
 * Consigne système, différenciée selon le registre de la conversation (A.10).
 *
 * Le bornage du canal permanent est appliqué ici, côté serveur, et non dans
 * l'UI : c'est une règle métier, elle doit valoir identiquement pour le web,
 * le mobile et le desktop (§5.3).
 */
function buildSystemPrompt(
  kind: Conversation["kind"],
  todo: Housekeeping,
  context: AssistantContext,
  now: Date,
): string {
  // Commun aux trois registres : sans repère temporel le modèle date au jugé,
  // et sans le prénom il s'adresse à un inconnu dont il vient de recueillir
  // l'histoire.
  const preamble = [...describeNow(context.timezone, now), ...describeUser(context.displayName)];

  if (kind === "assistant") {
    // L'accueil prend toute la place tant qu'il dure : lui superposer le
    // bornage du canal ferait ouvrir une conversation dédiée au premier projet
    // évoqué, alors qu'on cherche justement à en entendre parler ici.
    if (context.onboarding) return buildOnboardingPrompt(context.name, preamble);

    const channel = [
      `Tu es ${context.name}, l'assistant d'organisation personnelle de l'utilisateur.`,
      ...preamble,
      "",
      "Ce canal est réservé à trois sujets : les rappels (ce qui est important",
      "aujourd'hui ou cette semaine), l'organisation interne de l'outil (dossiers,",
      "rangement, structure), et l'évolution de la structure du projet de l'utilisateur.",
      "",
      "Si la demande sort de ce périmètre, ne la traite pas ici : appelle",
      "`open_new_conversation` avec un titre tiré de la demande, et n'écris rien",
      "d'autre. L'application annonce elle-même la conversation dédiée et en",
      "demande la validation ; la réponse sera donnée là-bas.",
      "",
      "Prends les devants : quand un échange laisse deviner une action à faire,",
      "propose-la plutôt que d'attendre qu'on te la demande. Reste suggestif —",
      "une proposition courte que l'utilisateur accepte ou ignore d'un geste.",
      "",
      "Quand tu poses une question dont quelques réponses couvrent l'essentiel des",
      "cas, pose-la avec `ask_question` : l'utilisateur répond d'un appui plutôt",
      "que d'écrire. Réserve-la à ces questions-là.",
      ...TOOL_ANSWER_RULE,
      "Seule exception : `open_new_conversation`, après lequel tu n'écris rien.",
      ...FORMAT_RULES,
      ...describeAgenda(todo.channel?.agenda ?? [], context.timezone),
    ];

    const known = todo.channel?.folders ?? [];

    if (known.length > 0) {
      channel.push(
        "",
        "Dossiers que l'utilisateur possède déjà. Ne propose jamais de créer l'un",
        "d'eux : il existe. Rattache-toi à ce qui est là, et reprends sa façon de",
        "les nommer plutôt qu'une nomenclature standard.",
        ...describeFolders(known),
      );
    }

    if (todo.tools.includes(SUGGEST_PROJECT_FOLDERS)) {
      channel.push(
        "",
        "Quand l'échange fait apparaître un projet — un objectif qui va demander",
        "plusieurs actions de nature différente (une idée, un achat, une tâche,",
        "un rendez-vous) sur plusieurs jours ou semaines, pas une question qui",
        "se referme en un message — appelle `suggest_project_folders` pour",
        "proposer les dossiers correspondants. L'outil ne crée rien : il",
        "affiche une proposition que l'utilisateur valide. Ne dis donc jamais",
        "que les dossiers sont créés, demande.",
      );
    }

    return [...channel, ...describeMemory(context.memory), ...describeDecisions(todo.decided)].join(
      "\n",
    );
  }

  const lines = [
    `Tu es ${context.name}, un assistant conversationnel personnel.`,
    ...preamble,
    "",
    "Réponds de façon utile, directe et naturelle, en français.",
    "",
    "Quand tu poses une question dont quelques réponses couvrent l'essentiel des cas,",
    "pose-la avec `ask_question` : l'utilisateur répond d'un appui plutôt que d'écrire.",
    "Réserve-la à ces questions-là — une question ouverte se pose à l'écrit.",
    ...TOOL_ANSWER_RULE,
    ...FORMAT_RULES,
    ...describeMemory(context.memory),
  ];

  // Réclamée seulement si le tour a de quoi y répondre : sans outil de
  // proposition, la consigne pousserait le modèle à annoncer en clair une
  // todoliste que personne ne créerait — exactement ce que le §12.1 interdit.
  if (todo.tools.some((tool) => tool !== NAME_CONVERSATION && tool !== SUGGEST_FOLDERS)) {
    lines.push(
      "",
      "Au fil de l'échange, repère si la conversation produit quelque chose",
      "d'actionnable : une liste de tâches, une liste d'achats, une échéance,",
      "un rendez-vous récurrent. Le cas échéant, appelle l'outil correspondant",
      "pour le proposer — sans interrompre le fil de la conversation, et sans",
      "jamais présenter la chose comme déjà faite : c'est une proposition.",
      "",
      "Prends aussi les devants une fois la réponse donnée : si elle débouche",
      "clairement sur une suite concrète — contacter quelqu'un, comparer une",
      "offre, décider avant une date — propose-la avec l'outil correspondant",
      "plutôt que d'attendre qu'on te la demande. Réserve ça aux cas nets, pas",
      "à chaque réponse : dans le doute, n'ajoute rien.",
    );
  }

  if (todo.tools.includes(SUGGEST_TASK_LIST)) {
    lines.push(
      "",
      "Si l'utilisateur demande explicitement de transformer l'échange en",
      "todoliste, ne le décris pas en texte : appelle `suggest_task_list` tout",
      "de suite, comme pour n'importe quelle autre proposition — la demande",
      "explicite ne dispense pas de la faire valider.",
    );
  }

  // Exposer l'outil ne suffit pas : sa description est lue au moment de choisir,
  // pas au moment de décider s'il y a lieu de choisir. Les gestes d'entretien
  // du fil sont donc demandés explicitement ici.
  // Le modèle ne peut agir que sur ce qu'il connaît : sans le contenu ni
  // l'échéance des listes, « complète la liste » ou « décale-la » n'ont rien à
  // désigner, et le modèle inventerait un identifiant ou une seconde liste.
  if (todo.tools.includes(SUGGEST_TASK_LIST_ITEMS) || todo.tools.includes(SUGGEST_TASK_LIST_DUE_DATE)) {
    lines.push("", "Todolistes déjà nées de cette conversation.", ...describeTaskLists(todo.lists));
  }

  if (todo.tools.includes(SUGGEST_TASK_LIST_ITEMS)) {
    lines.push(
      "",
      "Pour compléter une liste ci-dessus, appelle `suggest_task_list_items` avec",
      "son identifiant recopié caractère pour caractère. N'ouvre jamais une seconde",
      "liste pour un sujet que l'une d'elles couvre déjà, et n'y propose que des",
      "lignes qui n'y figurent pas.",
    );
  }

  if (todo.tools.includes(SUGGEST_TASK_LIST_DUE_DATE)) {
    lines.push(
      "",
      "Pour décaler l'échéance d'une liste ci-dessus — l'utilisateur la reporte,",
      "l'avance, ou en fixe une pour la première fois — appelle",
      "`suggest_task_list_due_date` avec son identifiant recopié caractère pour",
      "caractère et la nouvelle date. N'appelle cet outil que sur demande",
      "explicite : ne reprogramme jamais une liste de ta propre initiative, et la",
      "nouvelle échéance doit toujours tomber aujourd'hui ou après.",
    );
  }

  if (todo.tools.includes(NAME_CONVERSATION)) {
    lines.push(
      "",
      "Cette conversation n'a pas encore de titre. Appelle `name_conversation`",
      "dès ce tour-ci, sur la foi du premier message : un titre approximatif vaut",
      "mieux qu'une liste de « Nouvelle conversation » indiscernables dans la barre",
      "latérale, et l'utilisateur peut le corriger. N'attends pas qu'on te le",
      "demande et n'en parle pas : le titre s'applique seul.",
    );
  }

  if (todo.filing) {
    const alreadyFiled = todo.filing.currentFolderIds.length > 0;

    lines.push(
      "",
      alreadyFiled
        ? describeCurrentFiling(todo.filing.currentFolderIds, todo.filing.folders)
        : "Elle n'est rangée dans aucun dossier. Dès que son sujet est clair, appelle " +
            "`suggest_folders` pour proposer où la ranger. N'attends pas qu'on te le " +
            "demande, et ne le fais qu'une fois.",
    );

    if (alreadyFiled) {
      lines.push(
        "",
        "N'appelle `suggest_folders` que si l'utilisateur demande explicitement de",
        "revoir ce rangement — le changer, l'étendre à un autre dossier, lui créer un",
        "sous-dossier. Ne le reproposer jamais de toi-même : elle est déjà rangée.",
        "L'appel remplace alors le rangement actuel en entier : reprends les dossiers",
        "à garder en plus de ceux à changer, un dossier actuel absent de l'appel en",
        "est retiré.",
      );
    }

    lines.push(
      "",
      "Ne propose que des dossiers dont cette conversation-ci traite réellement.",
      "Elle peut en relever de plusieurs à la fois — la mutuelle est à la fois",
      "« Santé » et « Assurances » — mais un dossier seulement voisin du sujet n'en",
      "fait pas partie : dans le doute, laisse-le de côté. Un dossier de trop range",
      "la conversation là où l'utilisateur n'ira jamais la chercher.",
      "",
      todo.filing.folders.length > 0
        ? "Dossiers existants. Pour en réutiliser un, recopie son identifiant ET son nom" +
          " tels quels : le serveur écarte la ligne si les deux ne se correspondent pas." +
          " Un nouveau dossier peut aussi naître comme sous-dossier de l'un d'eux : reprends-le" +
          " alors en `parent`, de la même façon."
        : "L'utilisateur n'a encore aucun dossier : propose-en un nouveau, sobrement nommé.",
      ...describeFolders(todo.filing.folders),
    );
  }

  return [...lines, ...describeDecisions(todo.decided)].join("\n");
}

/**
 * Consigne de la conversation d'accueil (§6.3, A.13).
 *
 * Quelques questions ouvertes, pas un formulaire de profil : c'est la
 * différence que le cahier des charges demande explicitement. La brièveté est
 * répétée parce qu'un modèle laissé libre enchaînerait les questions, et que
 * l'accueil doit rendre la main vite.
 */
function buildOnboardingPrompt(assistantName: string, preamble: string[]): string {
  return [
    `Tu es ${assistantName}, l'assistant d'organisation personnelle de l'utilisateur.`,
    ...preamble,
    "Il vient de créer son compte : tu l'accueilles, et vous faites connaissance.",
    "",
    "Pose des questions ouvertes, une seule à la fois, sur qui il est, où il en",
    "est côté professionnel et personnel, les projets ou les idées qu'il a en tête.",
    "Reste conversationnel et bref — deux ou trois phrases par tour. Ce n'est pas",
    "un formulaire de profil : rebondis sur ce qu'il raconte plutôt que de dérouler",
    "une liste. N'insiste jamais sur une question laissée sans réponse.",
    "",
    "Quand ta question appelle quelques réponses plutôt qu'un récit, pose-la avec",
    "`ask_question` : l'utilisateur répond alors d'un appui. Une question ouverte,",
    "elle, se pose à l'écrit — lui souffler quatre réponses le priverait de la sienne.",
    "",
    "Au bout de trois ou quatre échanges, appelle `finish_onboarding` avec ce",
    "qu'il faut retenir de lui, sans l'annoncer, et enchaîne naturellement.",
    "",
    "Si un projet concret se dessine dans ce qu'il raconte, appelle",
    "`suggest_project_folders` pour proposer les dossiers correspondants. L'outil",
    "ne crée rien : il affiche une proposition que l'utilisateur valide d'un geste.",
    "Ne présente donc jamais les dossiers comme déjà créés.",
    ...TOOL_ANSWER_RULE,
  ].join("\n");
}

/**
 * Consigne du geste « convertir en todoliste » (§13.4.1, #17).
 *
 * Distincte de `buildSystemPrompt` : ce n'est pas un tour de dialogue mais un
 * appel ponctuel où un seul outil a un sens. Reprendre toute la consigne
 * habituelle — format de réponse, autres outils — n'apporterait rien à un
 * appel qui ne produit jamais de texte.
 */
function buildExtractionPrompt(context: AssistantContext, now: Date): string {
  return [
    `Tu es ${context.name}, l'assistant d'organisation personnelle de l'utilisateur.`,
    ...describeNow(context.timezone, now),
    "",
    "L'utilisateur vient de demander explicitement de transformer cette",
    "conversation en todoliste. Relis l'échange et appelle `suggest_task_list`",
    "avec ce qui en ressort — une liste d'achats et une liste de tâches",
    "distinctes s'il y a lieu, jamais fusionnées. N'écris aucun texte : la",
    "carte de proposition suffit, comme pour n'importe quelle autre suggestion.",
  ].join("\n");
}

/**
 * Repère temporel du tour, dans le fuseau de l'utilisateur.
 *
 * Sans lui le modèle date au jugé : les outils réclament des échéances ISO
 * déduites de « lundi prochain » (A.3), et le canal annonce comme premier sujet
 * ce qui est important aujourd'hui (A.10). Un fuseau illisible retombe sur le
 * défaut du schéma plutôt que de faire échouer le tour — une consigne datée
 * approximativement vaut mieux qu'une conversation perdue.
 */
function describeNow(timezone: string, now: Date): string[] {
  return ["", `Nous sommes ${formatInstant(now, timezone)} (fuseau ${timezone}).`];
}

/** Ce que l'assistant sait de l'identité de l'utilisateur, s'il sait quelque chose. */
function describeUser(displayName: string | null): string[] {
  return displayName ? [`L'utilisateur s'appelle ${displayName}.`] : [];
}

/**
 * Agenda des jours qui viennent, remis au seul canal permanent (A.10).
 *
 * Les séries récurrentes ne sont pas expansées (A.11) : une ligne portant une
 * `rrule` n'apparaît qu'à la date de son premier créneau. La limite est dite au
 * modèle plutôt que laissée à deviner, sans quoi il conclurait d'une semaine
 * vide qu'il n'y a rien de prévu.
 */
function describeAgenda(events: CalendarEvent[], timezone: string): string[] {
  if (events.length === 0) return [];

  return [
    "",
    `Agenda des ${AGENDA_WINDOW_DAYS} prochains jours. Les rendez-vous récurrents`,
    "n'y figurent qu'à leur première occurrence : ne conclus pas d'une absence",
    "qu'il n'y a rien de prévu.",
    ...events.map((event) => `- ${describeSlot(event, timezone)} — ${event.title}`),
  ];
}

/** Date seule pour une journée entière, date et heure locale sinon. */
function describeSlot(event: CalendarEvent, timezone: string): string {
  const start = new Date(event.startsAt);
  return event.allDay
    ? `${formatInstant(start, timezone, "date")} (journée entière)`
    : formatInstant(start, timezone);
}

/**
 * Propositions déjà faites sur ce fil, et ce qu'elles sont devenues (§12.1).
 *
 * Sans elles le modèle ne relit que sa propre prose : rien ne l'empêche de
 * reformuler au tour suivant une proposition que l'utilisateur vient d'écarter,
 * ce qui est l'inverse du « suggestif et non intrusif ».
 */
function describeDecisions(suggestions: Suggestion[]): string[] {
  const recent = suggestions.slice(-RECENT_DECISIONS);
  if (recent.length === 0) return [];

  return [
    "",
    "Propositions que tu as déjà faites sur ce fil :",
    ...recent.map((suggestion) => `- « ${suggestion.message} » → ${outcome(suggestion.status)}`),
    // L'accepté était absent de cette phrase : le modèle reproposait donc à
    // l'identique ce qui venait d'être créé.
    "Ne repropose ni ce qui a été accepté, ni ce qui a été écarté, ni ce qui attend",
    "encore une réponse.",
  ];
}

/**
 * Todolistes du fil, telles que le modèle doit les lire.
 *
 * Le contenu est repris ligne à ligne, pas résumé : c'est ce qui lui permet de
 * ne pas proposer une deuxième fois ce qui est déjà dans la liste. Le retrait
 * marque les sous-tâches, comme dans l'éditeur.
 *
 * L'échéance actuelle est incluse pour que « décale-la de 3 jours » se calcule
 * depuis la date de la liste, pas depuis aujourd'hui.
 */
function describeTaskLists(lists: TaskListWithTasks[]): string[] {
  return lists.map((list) => {
    const nature = list.kind === "shopping" ? "achats" : "tâches";
    const due = list.dueAt === null ? "sans échéance" : `échéance ${list.dueAt}`;
    const content =
      list.tasks.length === 0
        ? "vide"
        : list.tasks
            .map((task) => (task.parentId === null ? task.title : `> ${task.title}`))
            .join(", ");

    return `- « ${list.title} » (identifiant ${list.id}, ${nature}, ${due}) : ${content}`;
  });
}

function outcome(status: Suggestion["status"]): string {
  switch (status) {
    case "pending":
      return "en attente de réponse";
    case "accepted":
      return "acceptée";
    case "dismissed":
      return "écartée par l'utilisateur";
    case "expired":
      return "expirée";
  }
}

/**
 * Question à réponses proposées portée par les appels d'outils du tour.
 *
 * Appliquée directement plutôt que transformée en suggestion : rien n'est
 * écrit dans les données de l'utilisateur, on donne seulement une forme à une
 * question que le modèle poserait de toute façon (§12.1).
 *
 * Un appel inexploitable est abandonné et la réponse reste affichée en texte :
 * une carte de choix vide serait pire qu'une question posée à l'écrit.
 */
function readQuestion(toolCalls: LlmToolCall[]): AskedQuestion | null {
  const call = toolCalls.find((toolCall) => toolCall.name === ASK_QUESTION.name);
  if (!call) return null;

  const asked = askedQuestionSchema.safeParse(call.input);
  if (!asked.success) {
    logger.warn(SCOPE, "Appel `ask_question` inexploitable : réponses proposées ignorées.");
    return null;
  }

  return asked.data;
}

/** Ce que l'assistant sait déjà de l'utilisateur, s'il sait quelque chose (§13.4.2). */
function describeMemory(memory: string | null): string[] {
  if (!memory) return [];

  return [
    "",
    "Ce que tu sais de l'utilisateur, appris lors de vos échanges précédents.",
    "Utilise-le pour ajuster tes réponses, sans le lui réciter ni t'en vanter :",
    memory,
  ];
}

/** Les outils du jeu dont la capacité reste active dans les réglages (A.10). */
function allowed(tools: LlmTool[], scope: AssistantScope): LlmTool[] {
  return tools.filter((tool) => isAllowedByScope(tool.name, scope));
}

/** Une proposition de ce type attend-elle encore une réponse de l'utilisateur ? */
function isPending(suggestions: Suggestion[], kind: Suggestion["kind"]): boolean {
  return suggestions.some(
    (suggestion) => suggestion.status === "pending" && suggestion.kind === kind,
  );
}

/** Fenêtre d'agenda remise au canal : de maintenant à `AGENDA_WINDOW_DAYS` jours. */
function agendaWindow(now: Date): CalendarRange {
  const to = new Date(now.getTime() + AGENDA_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { from: now.toISOString(), to: to.toISOString() };
}

/**
 * Instant rendu en français dans le fuseau de l'utilisateur.
 *
 * Un fuseau invalide en base ferait lever `Intl` et emporterait le tour de
 * dialogue avec lui : on retombe alors sur le fuseau par défaut du schéma, en
 * le signalant.
 */
function formatInstant(
  instant: Date,
  timezone: string,
  precision: "date" | "full" = "full",
): string {
  const options: Intl.DateTimeFormatOptions =
    precision === "date" ? { dateStyle: "full" } : { dateStyle: "full", timeStyle: "short" };

  try {
    return new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: timezone }).format(instant);
  } catch (error) {
    logger.warn(
      SCOPE,
      "Fuseau horaire illisible, repli sur le défaut :",
      error instanceof Error ? error.message : error,
    );
    return new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: DEFAULT_TIMEZONE }).format(
      instant,
    );
  }
}

/**
 * Rangement actuel d'une conversation déjà classée, tel que lu dans la consigne.
 *
 * Sans cette phrase, le modèle qui reçoit à nouveau `suggest_folders` — parce
 * que l'utilisateur demande de le changer — ne saurait pas ce qu'il modifie :
 * l'appel remplace le rangement entier, encore faut-il connaître celui qu'il
 * remplace pour décider quoi garder.
 */
function describeCurrentFiling(currentFolderIds: string[], tree: FolderTreeNode[]): string {
  const known = flattenWithPath(tree);
  const paths = currentFolderIds.flatMap((id) => {
    const folder = known.find((candidate) => candidate.id === id);
    return folder ? [folder.path] : [];
  });

  return paths.length > 0
    ? `Elle est déjà rangée dans ${paths.join(", ")}.`
    : "Elle est déjà rangée, dans un dossier qui n'apparaît plus dans son arborescence actuelle.";
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
