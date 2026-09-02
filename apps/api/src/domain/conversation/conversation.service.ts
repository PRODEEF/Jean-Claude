import {
  assistantScopeSchema,
  DEFAULT_ASSISTANT_NAME,
  DEFAULT_CONVERSATION_TITLE,
  askedQuestionSchema,
  labelSchema,
  userMemorySchema,
  userPreferencesSchema,
} from "@jc/domain";
import type {
  AskedQuestion,
  AssignFolders,
  AssistantScope,
  CalendarEvent,
  CalendarRange,
  Conversation,
  CreateConversation,
  CursorPagination,
  EditMessage,
  FolderTreeNode,
  Message,
  MessageStreamEvent,
  Paginated,
  SendMessage,
  Suggestion,
  UpdateConversation,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import type { LlmProvider, LlmTool, LlmToolCall } from "../../core/llm/llm.port.js";
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
} from "../../core/llm/llm.tools.js";
import type { CalendarService } from "../calendar/calendar.service.js";
import type { FolderService } from "../folder/folder.service.js";
import type { SuggestionService } from "../suggestion/suggestion.service.js";
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
  filing: { folders: FolderTreeNode[] } | null;
  /**
   * Ce que le canal permanent doit savoir de l'utilisateur pour proposer juste :
   * ses dossiers, et son agenda proche. `null` partout ailleurs — une
   * conversation classique n'a pas à connaître les rendez-vous de son auteur.
   */
  channel: { folders: FolderTreeNode[]; agenda: CalendarEvent[] } | null;
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
        { content: welcomeMessage(context.name), inputMode: "text", role: "assistant" },
        accessToken,
      );
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

    await this.conversations.deleteMessagesAfter(conversationId, message.createdAt, accessToken);
    if (message.role === "assistant") {
      await this.conversations.deleteMessage(messageId, accessToken);
    }

    yield* this.generate(conversation, userId, accessToken);
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

    const history = await this.conversations.listMessages(conversationId, accessToken, {
      limit: CONTEXT_WINDOW_MESSAGES,
    });

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

    // Instant du tour, pris une fois : la fenêtre d'agenda et le repère
    // temporel de la consigne doivent désigner le même moment.
    const now = new Date();

    // Profil et entretien du fil : résolus avant l'appel au modèle, parce que
    // les deux décident des outils qu'on lui expose.
    const context = await this.contextFor(userId, accessToken);
    const todo = await this.pendingHousekeeping(conversation, context, now, accessToken);

    try {
      const stream = this.llm.stream({
        system: buildSystemPrompt(conversation.kind, todo, context, now),
        messages: dialogue.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
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

      const assistantMessage =
        content.length > 0
          ? await this.conversations.appendMessage(
              conversationId,
              userId,
              {
                content,
                inputMode: "text",
                role: "assistant",
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
          console.warn(`Appel d'outil hors du périmètre autorisé, ignoré : ${toolCall.name}`);
          continue;
        }
        await this.suggestions.capture(userId, conversationId, toolCall, accessToken);
      }

      await this.applyRequestedTitle(conversationId, toolCalls, accessToken);

      await this.applyOnboardingMemory(userId, toolCalls, accessToken);

      if (assistantMessage) yield { type: "done", message: assistantMessage };
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
      console.warn("Profil introuvable au moment de borner l'assistant : réglages par défaut.");
      return {
        name: DEFAULT_ASSISTANT_NAME,
        displayName: null,
        timezone: DEFAULT_TIMEZONE,
        scope: assistantScopeSchema.parse({}),
        memory: null,
        onboarding: false,
      };
    }

    return {
      name: profile.preferences.assistantName,
      displayName: profile.displayName,
      timezone: profile.preferences.timezone,
      scope: profile.preferences.scope,
      memory: profile.memory,
      onboarding: profile.onboardingCompletedAt === null,
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
   * ranger tant qu'elle n'est dans aucun dossier.
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
        return { tools, filing: null, channel: null, decided: [] };
      }

      const decided = await this.suggestions.listForConversation(conversation.id, accessToken);
      const structuring = isPending(decided, "create_project_folders")
        ? tools.filter((tool) => tool !== SUGGEST_PROJECT_FOLDERS)
        : tools;

      const [folders, agenda] = await Promise.all([
        // L'arborescence n'est lue que si le modèle peut en proposer une : sans
        // l'outil, elle ne servirait qu'à allonger la consigne.
        structuring.includes(SUGGEST_PROJECT_FOLDERS)
          ? this.folders.getTree(accessToken)
          : Promise.resolve<FolderTreeNode[]>([]),
        this.calendar.list(agendaWindow(now), accessToken),
      ]);

      return { tools: structuring, filing: null, channel: { folders, agenda }, decided };
    }

    // `SUGGEST_FOLDERS` n'est rendu qu'aux conversations non classées : il n'a
    // rien à proposer sur un fil déjà rangé.
    const tools = allowed(CHAT_TOOLS, scope).filter((tool) => tool !== SUGGEST_FOLDERS);

    if (conversation.title === DEFAULT_CONVERSATION_TITLE) tools.push(NAME_CONVERSATION);

    const decided = await this.suggestions.listForConversation(conversation.id, accessToken);

    if (
      conversation.folderIds.length > 0 ||
      !scope.folderOrganization ||
      isPending(decided, "assign_folders")
    ) {
      return { tools, filing: null, channel: null, decided };
    }

    tools.push(SUGGEST_FOLDERS);
    return {
      tools,
      filing: { folders: await this.folders.getTree(accessToken) },
      channel: null,
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
      console.warn("Appel `name_conversation` sans titre exploitable : renommage ignoré.");
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
      console.warn("Appel `finish_onboarding` sans mémoire exploitable : accueil non clos.");
      return;
    }

    try {
      await this.users.completeOnboarding(userId, memory.data, accessToken);
    } catch (error) {
      console.error(
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
    console.warn("Appel `open_new_conversation` sans titre exploitable : bascule ignorée.");
    return null;
  }

  return title.data;
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
        "Quand l'échange fait apparaître un besoin de rangement — un projet qui",
        "démarre, un sujet qui revient, un espace mal structuré — appelle",
        "`suggest_project_folders` pour proposer les dossiers correspondants.",
        "L'outil ne crée rien : il affiche une proposition que l'utilisateur",
        "valide. Ne dis donc jamais que les dossiers sont créés, demande.",
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
    );
  }

  // Exposer l'outil ne suffit pas : sa description est lue au moment de choisir,
  // pas au moment de décider s'il y a lieu de choisir. Les deux gestes
  // d'entretien du fil sont donc demandés explicitement ici.
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
    "Ne repropose ni ce qui a été écarté, ni ce qui attend encore une réponse.",
  ];
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
    console.warn("Appel `ask_question` inexploitable : réponses proposées ignorées.");
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
    console.warn(
      "Fuseau horaire illisible, repli sur le défaut :",
      error instanceof Error ? error.message : error,
    );
    return new Intl.DateTimeFormat("fr-FR", { ...options, timeZone: DEFAULT_TIMEZONE }).format(
      instant,
    );
  }
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
