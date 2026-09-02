import {
  assistantScopeSchema,
  DEFAULT_ASSISTANT_NAME,
  DEFAULT_CONVERSATION_TITLE,
  labelSchema,
  userMemorySchema,
} from "@jc/domain";
import type {
  AssignFolders,
  AssistantScope,
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
  FINISH_ONBOARDING,
  isAllowedByScope,
  NAME_CONVERSATION,
  OPEN_NEW_CONVERSATION,
  SUGGEST_FOLDERS,
  SUGGEST_PROJECT_FOLDERS,
} from "../../core/llm/llm.tools.js";
import type { FolderService } from "../folder/folder.service.js";
import type { SuggestionService } from "../suggestion/suggestion.service.js";
import type { IUserRepository } from "../user/user.repository.interface.js";
import type { IConversationRepository } from "./conversation.repository.interface.js";

/** Nombre de messages de contexte envoyés au modèle à chaque tour. */
const CONTEXT_WINDOW_MESSAGES = 40;

/**
 * Outils que le serveur applique lui-même, et qui ne deviennent donc pas des
 * propositions à valider. Ils ne touchent pas aux données de l'utilisateur :
 * l'un nomme la conversation, l'autre choisit où la réponse sera donnée.
 */
const APPLIED_DIRECTLY = new Set([
  NAME_CONVERSATION.name,
  OPEN_NEW_CONVERSATION.name,
  FINISH_ONBOARDING.name,
]);

/**
 * Ce que le tour peut encore faire du fil. `filing` à `null` signifie qu'aucun
 * rangement n'est à proposer — un tableau de dossiers vide, lui, resterait
 * ambigu : l'utilisateur peut n'avoir aucun dossier et attendre le premier.
 */
type Housekeeping = {
  tools: LlmTool[];
  filing: { folders: FolderTreeNode[] } | null;
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
  scope: AssistantScope;
  /** Contexte stable appris à l'accueil puis enrichi (§13.4.2). */
  memory: string | null;
  /** L'accueil n'a pas encore été mené à son terme (§6.3, A.13). */
  onboarding: boolean;
};

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

    const history = await this.conversations.listMessages(conversationId, accessToken, {
      limit: CONTEXT_WINDOW_MESSAGES,
    });

    let text = "";
    let provider: string | null = null;
    let model: string | null = null;
    const toolCalls: LlmToolCall[] = [];

    // Profil et entretien du fil : résolus avant l'appel au modèle, parce que
    // les deux décident des outils qu'on lui expose.
    const context = await this.contextFor(userId, accessToken);
    const todo = await this.pendingHousekeeping(conversation, context, accessToken);

    try {
      const stream = this.llm.stream({
        system: buildSystemPrompt(conversation.kind, todo, context),
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

      const redirect = await this.openRequestedConversation(userId, toolCalls, accessToken);

      if (assistantMessage) yield { type: "done", message: assistantMessage };
      if (redirect) yield { type: "redirect", conversation: redirect };
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
        scope: assistantScopeSchema.parse({}),
        memory: null,
        onboarding: false,
      };
    }

    return {
      name: profile.preferences.assistantName,
      scope: profile.preferences.scope,
      memory: profile.memory,
      onboarding: profile.onboardingCompletedAt === null,
    };
  }

  /**
   * Outils du tour, et arborescence à injecter dans la consigne.
   *
   * Le canal permanent a son propre jeu (A.10). Une conversation classique
   * reçoit en plus de quoi se nommer tant qu'elle porte le titre par défaut, et
   * de quoi se ranger tant qu'elle n'est dans aucun dossier — mais pas si une
   * proposition de rangement attend déjà une réponse : la relancer à chaque
   * message empilerait les cartes sur un geste que l'utilisateur a laissé venir.
   *
   * Le périmètre s'applique en amont de tout le reste : un outil dont la
   * capacité est désactivée n'entre pas dans le jeu, et la consigne cesse du
   * même coup de le réclamer.
   */
  private async pendingHousekeeping(
    conversation: Conversation,
    context: AssistantContext,
    accessToken: string,
  ): Promise<Housekeeping> {
    const scope = context.scope;

    if (conversation.kind === "assistant") {
      const tools = allowed(ASSISTANT_TOOLS, scope);
      // L'accueil se déroule dans le canal permanent : tant qu'il n'est pas
      // clos, le modèle doit pouvoir le clore lui-même.
      if (context.onboarding) tools.push(FINISH_ONBOARDING);
      return { tools, filing: null };
    }

    // `SUGGEST_FOLDERS` n'est rendu qu'aux conversations non classées : il n'a
    // rien à proposer sur un fil déjà rangé.
    const tools = allowed(CHAT_TOOLS, scope).filter((tool) => tool !== SUGGEST_FOLDERS);

    if (conversation.title === DEFAULT_CONVERSATION_TITLE) tools.push(NAME_CONVERSATION);

    if (conversation.folderIds.length > 0 || !scope.folderOrganization) {
      return { tools, filing: null };
    }

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
function buildSystemPrompt(
  kind: Conversation["kind"],
  todo: Housekeeping,
  context: AssistantContext,
): string {
  if (kind === "assistant") {
    // L'accueil prend toute la place tant qu'il dure : lui superposer le
    // bornage du canal ferait ouvrir une conversation dédiée au premier projet
    // évoqué, alors qu'on cherche justement à en entendre parler ici.
    if (context.onboarding) return buildOnboardingPrompt(context.name);

    const channel = [
      `Tu es ${context.name}, l'assistant d'organisation personnelle de l'utilisateur.`,
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
    ];

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

    return [...channel, ...describeMemory(context.memory)].join("\n");
  }

  const lines = [
    `Tu es ${context.name}, un assistant conversationnel personnel.`,
    "Réponds de façon utile, directe et naturelle, en français.",
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

  return lines.join("\n");
}

/**
 * Consigne de la conversation d'accueil (§6.3, A.13).
 *
 * Quelques questions ouvertes, pas un formulaire de profil : c'est la
 * différence que le cahier des charges demande explicitement. La brièveté est
 * répétée parce qu'un modèle laissé libre enchaînerait les questions, et que
 * l'accueil doit rendre la main vite.
 */
function buildOnboardingPrompt(assistantName: string): string {
  return [
    `Tu es ${assistantName}, l'assistant d'organisation personnelle de l'utilisateur.`,
    "Il vient de créer son compte : tu l'accueilles, et vous faites connaissance.",
    "",
    "Pose des questions ouvertes, une seule à la fois, sur qui il est, où il en",
    "est côté professionnel et personnel, les projets ou les idées qu'il a en tête.",
    "Reste conversationnel et bref — deux ou trois phrases par tour. Ce n'est pas",
    "un formulaire de profil : rebondis sur ce qu'il raconte plutôt que de dérouler",
    "une liste. N'insiste jamais sur une question laissée sans réponse.",
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
