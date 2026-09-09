import { DEFAULT_CONVERSATION_TITLE } from "@jc/domain";
import type {
  AssistantScope,
  CalendarEvent,
  Conversation,
  Folder,
  Message,
  MessageStreamEvent,
  Suggestion,
  Task,
  TaskListWithTasks,
  UserPreferences,
} from "@jc/domain";
import type { LlmCompletionRequest, LlmProvider, LlmToolCall } from "../../core/llm/llm.port.js";
import type { AttachmentRecord, IAttachmentRepository } from "../attachment/attachment.repository.interface.js";
import type { ICalendarRepository } from "../calendar/calendar.repository.interface.js";
import { CalendarService } from "../calendar/calendar.service.js";
import type { IFolderRepository } from "../folder/folder.repository.interface.js";
import { FolderService } from "../folder/folder.service.js";
import type { ISuggestionRepository } from "../suggestion/suggestion.repository.interface.js";
import { SuggestionService } from "../suggestion/suggestion.service.js";
import type { ITaskRepository } from "../task/task.repository.interface.js";
import { TaskService } from "../task/task.service.js";
import type { IUserRepository, ProfileRecord } from "../user/user.repository.interface.js";
import { ConversationService } from "./conversation.service.js";
import type { IConversationRepository } from "./conversation.repository.interface.js";

const TOKEN = "access-token";
const USER = "user-1";

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    kind: "chat",
    title: "Travaux de jardin",
    folderIds: [],
    archivedAt: null,
    lastMessageAt: null,
    createdAt: "2026-08-31T08:00:00.000Z",
    updatedAt: "2026-08-31T08:00:00.000Z",
    unreadCount: 0,
    hasPendingQuestion: false,
    ...overrides,
  };
}

function makeMessage(
  overrides: Partial<Message> & Pick<Message, "id" | "role" | "content">,
): Message {
  return {
    conversationId: "conv-1",
    inputMode: "text",
    attachments: [],
    provider: null,
    model: null,
    choices: null,
    redirectTitle: null,
    redirectAcceptedAt: null,
    createdAt: "2026-08-31T08:00:00.000Z",
    ...overrides,
  };
}

/** Fil vide — l'état d'un canal permanent qui n'a encore rien reçu (§6.3). */
function emptyThread() {
  return jest.fn().mockResolvedValue({ items: [], nextCursor: null });
}

function makeRepository(overrides: Partial<IConversationRepository> = {}): IConversationRepository {
  return {
    findAll: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    findById: jest.fn().mockResolvedValue(makeConversation()),
    findAssistantChannel: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(makeConversation()),
    update: jest.fn().mockResolvedValue(makeConversation()),
    delete: jest.fn().mockResolvedValue(undefined),
    markRead: jest.fn().mockResolvedValue(makeConversation()),
    setFolders: jest.fn().mockResolvedValue([]),
    // Le fil tel que le serveur le relit après avoir écrit la demande : la
    // génération part toujours d'au moins un message, jamais du vide.
    listMessages: jest.fn().mockResolvedValue({
      items: [makeMessage({ id: "msg-user", role: "user", content: "Bonjour" })],
      nextCursor: null,
    }),
    appendMessage: jest
      .fn()
      .mockImplementation((_id, _user, message: { role: Message["role"]; content: string }) =>
        Promise.resolve(makeMessage({ id: `msg-${message.role}`, ...message })),
      ),
    findMessage: jest.fn().mockResolvedValue(null),
    updateMessageContent: jest
      .fn()
      .mockImplementation((id: string, content: string) =>
        Promise.resolve(makeMessage({ id, role: "user", content })),
      ),
    deleteMessage: jest.fn().mockResolvedValue(undefined),
    deleteMessagesAfter: jest.fn().mockResolvedValue(undefined),
    acceptRedirect: jest.fn().mockImplementation((id: string) =>
      Promise.resolve(
        makeMessage({
          id,
          role: "assistant",
          content: "Ce sujet mérite une conversation dédiée. On y bascule ?",
          redirectTitle: "Itinéraire en Bretagne",
          redirectAcceptedAt: "2026-09-02T10:00:00.000Z",
        }),
      ),
    ),
    ...overrides,
  };
}

/**
 * Moteur qui rend `chunks` de texte, puis ses éventuels appels d'outils, puis
 * clôt par un `done` — dans cet ordre, comme le fait l'adaptateur réel.
 */
function makeLlm(
  chunks: string[] = ["Voici ", "ce que je propose."],
  toolCalls: LlmToolCall[] = [],
): LlmProvider {
  const stream = jest.fn(() =>
    (async function* () {
      let text = "";
      for (const chunk of chunks) {
        text += chunk;
        yield { type: "text" as const, text: chunk };
      }
      for (const toolCall of toolCalls) {
        yield { type: "tool_call" as const, toolCall };
      }
      yield {
        type: "done" as const,
        response: {
          text,
          toolCalls,
          provider: "anthropic",
          model: "claude-opus-5",
          usage: { inputTokens: 12, outputTokens: 34 },
        },
      };
    })(),
  );

  return {
    name: "gateway",
    model: "anthropic/claude-sonnet-5",
    isSovereign: false,
    stream,
  };
}

/**
 * Moteur dont chaque appel rend le tour suivant de `turns` — le dernier se
 * répète ensuite.
 *
 * Nécessaire au rattrapage : le premier tour peut n'être qu'un appel d'outil,
 * le second doit alors écrire la réponse. `makeLlm` rejoue au contraire les
 * mêmes fragments à chaque appel.
 */
function makeLlmTurns(
  turns: { chunks?: string[]; toolCalls?: LlmToolCall[]; fails?: boolean }[],
): LlmProvider {
  let index = 0;

  const stream = jest.fn(() => {
    const turn = turns[Math.min(index, turns.length - 1)] ?? {};
    index += 1;

    return (async function* () {
      if (turn.fails) throw new Error("moteur indisponible");

      const chunks = turn.chunks ?? [];
      const toolCalls = turn.toolCalls ?? [];
      let text = "";

      for (const chunk of chunks) {
        text += chunk;
        yield { type: "text" as const, text: chunk };
      }
      for (const toolCall of toolCalls) {
        yield { type: "tool_call" as const, toolCall };
      }
      yield {
        type: "done" as const,
        response: {
          text,
          toolCalls,
          provider: "anthropic",
          model: "claude-opus-5",
          usage: { inputTokens: 12, outputTokens: 34 },
        },
      };
    })();
  });

  return { name: "gateway", model: "anthropic/claude-sonnet-5", isSovereign: false, stream };
}

function makeSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: "sug-1",
    kind: "create_project_folders",
    status: "pending",
    conversationId: "conv-1",
    message: "Je te crée un dossier Jardin ?",
    payload: {},
    createdAt: "2026-09-01T08:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

function makeSuggestionRepository(
  overrides: Partial<ISuggestionRepository> = {},
): ISuggestionRepository {
  const suggestion = makeSuggestion();

  return {
    create: jest.fn().mockResolvedValue(suggestion),
    findById: jest.fn().mockResolvedValue(suggestion),
    listPending: jest.fn().mockResolvedValue([]),
    listForConversation: jest.fn().mockResolvedValue([]),
    markResolved: jest.fn().mockResolvedValue(suggestion),
    ...overrides,
  };
}

/**
 * Service sous test, avec des doubles par défaut.
 *
 * Passer par une fabrique plutôt que d'appeler le constructeur : une
 * dépendance de plus ne rouvre alors pas chacun des tests du fichier.
 */
function makeFolder(overrides: Partial<Folder> & Pick<Folder, "id" | "name">): Folder {
  return {
    parentId: null,
    category: null,
    purpose: "generic",
    color: null,
    position: 0,
    createdByAssistant: false,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

function makeFolderRepository(folders: Folder[] = []): IFolderRepository {
  return {
    findAll: jest.fn().mockResolvedValue(folders),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
    countConversations: jest.fn().mockResolvedValue(new Map<string, number>()),
  };
}

function makeEvent(
  overrides: Partial<CalendarEvent> & Pick<CalendarEvent, "title">,
): CalendarEvent {
  return {
    id: "evt-1",
    notes: null,
    startsAt: "2026-09-03T16:00:00.000Z",
    endsAt: null,
    allDay: false,
    rrule: null,
    reminderMinutesBefore: null,
    folderId: null,
    conversationId: null,
    createdByAssistant: false,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

function makeCalendarRepository(events: CalendarEvent[] = []): ICalendarRepository {
  return {
    findInRange: jest.fn().mockResolvedValue(events),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
  };
}

function makePreferences(
  overrides: Partial<UserPreferences> = {},
  scope: Partial<AssistantScope> = {},
): UserPreferences {
  return {
    assistantName: "Jean-Claude",
    assistantColor: "#6366F1",
    theme: "system",
    flatBanner: false,
    timezone: "Europe/Paris",
    speakResponses: false,
    llmModel: null,
    ...overrides,
    scope: {
      morningReminders: true,
      folderOrganization: true,
      structureSuggestions: true,
      proactiveTaskDetection: true,
      proactiveScheduling: true,
      ...scope,
    },
  };
}

/**
 * Profil dont toutes les capacités du périmètre restent actives (A.10), et
 * dont l'accueil est déjà fait — c'est l'état d'un compte ordinaire, celui que
 * décrivent la plupart des tests. Ceux qui portent sur l'accueil (§6.3) le
 * remettent explicitement à `null`.
 */
function makeUserRepository(
  scope: Partial<AssistantScope> = {},
  record: Partial<ProfileRecord> = {},
): IUserRepository {
  const profile: ProfileRecord = {
    id: USER,
    displayName: "Clarisse",
    memory: null,
    onboardingCompletedAt: "2026-08-31T09:00:00.000Z",
    createdAt: "2026-08-31T08:00:00.000Z",
    preferences: makePreferences({}, scope),
    ...record,
  };

  return {
    findById: jest.fn().mockResolvedValue(profile),
    update: jest.fn().mockResolvedValue(profile),
    completeOnboarding: jest.fn().mockResolvedValue(profile),
    deleteAccount: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Todolistes du fil, telles que la consigne les lira.
 *
 * Seule `findByConversation` est appelée depuis le tour de dialogue : le reste
 * de l'interface ne sert qu'à satisfaire le type.
 */
function makeTaskRepository(lists: TaskListWithTasks[] = []): ITaskRepository {
  return {
    findAll: jest.fn().mockResolvedValue(lists),
    findById: jest.fn().mockResolvedValue(null),
    findByConversation: jest.fn().mockResolvedValue(lists),
    findByEventId: jest.fn().mockResolvedValue(null),
    createList: jest.fn(),
    updateList: jest.fn(),
    deleteList: jest.fn(),
    createTask: jest.fn(),
    updateTask: jest.fn(),
    deleteTask: jest.fn(),
    replaceTasks: jest.fn(),
  };
}

function makeAttachment(overrides: Partial<AttachmentRecord> = {}): AttachmentRecord {
  return {
    id: "att-1",
    messageId: null,
    url: "https://storage.example/att-1.png",
    fileName: "photo.png",
    mimeType: "image/png",
    byteSize: 1024,
    extractedText: null,
    createdAt: "2026-09-09T08:00:00.000Z",
    ...overrides,
  };
}

function makeAttachmentRepository(
  overrides: Partial<IAttachmentRepository> = {},
): IAttachmentRepository {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(null),
    findByIds: jest.fn().mockResolvedValue([]),
    linkToMessage: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeTaskListItem(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    listId: "11111111-1111-4111-8111-111111111111",
    title: "Pain",
    notes: null,
    done: false,
    completedAt: null,
    parentId: null,
    position: 0,
    createdAt: "2026-09-03T08:00:00.000Z",
    updatedAt: "2026-09-03T08:00:00.000Z",
    ...overrides,
  };
}

function makeTaskList(overrides: Partial<TaskListWithTasks> = {}): TaskListWithTasks {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Courses de samedi",
    kind: "shopping",
    dueAt: null,
    eventId: null,
    conversationId: "conv-1",
    folderId: null,
    createdByAssistant: true,
    createdAt: "2026-09-03T08:00:00.000Z",
    updatedAt: "2026-09-03T08:00:00.000Z",
    tasks: [],
    ...overrides,
  };
}

function makeService(
  repo: IConversationRepository = makeRepository(),
  llm: LlmProvider = makeLlm(),
  suggestions: ISuggestionRepository = makeSuggestionRepository(),
  folders: IFolderRepository = makeFolderRepository(),
  users: IUserRepository = makeUserRepository(),
  calendar: ICalendarRepository = makeCalendarRepository(),
  tasks: ITaskRepository = makeTaskRepository(),
  attachments: IAttachmentRepository = makeAttachmentRepository(),
): ConversationService {
  return new ConversationService(
    repo,
    llm,
    new SuggestionService(suggestions),
    new FolderService(folders),
    users,
    new CalendarService(calendar, tasks),
    new TaskService(tasks, calendar, users),
    attachments,
  );
}

/** Requête effectivement transmise au moteur IA lors du dernier appel. */
function lastRequest(llm: LlmProvider): LlmCompletionRequest {
  const stream = llm.stream as jest.Mock;
  return stream.mock.calls[0]?.[0] as LlmCompletionRequest;
}

/** Requête transmise au moteur lors de l'appel de rang `index`, à partir de 0. */
function requestAt(llm: LlmProvider, index: number): LlmCompletionRequest {
  const stream = llm.stream as jest.Mock;
  return stream.mock.calls[index]?.[0] as LlmCompletionRequest;
}

/** Nombre d'appels réellement passés au moteur pendant le tour. */
function callCount(llm: LlmProvider): number {
  return (llm.stream as jest.Mock).mock.calls.length;
}

/** Déroule le tour de dialogue en entier, comme le fait le controller. */
async function drain(
  service: ConversationService,
  input = { content: "Bonjour", inputMode: "text" as const, attachmentIds: [] as string[] },
): Promise<MessageStreamEvent[]> {
  const events: MessageStreamEvent[] = [];
  for await (const event of service.streamMessage("conv-1", USER, input, TOKEN)) {
    events.push(event);
  }
  return events;
}

/**
 * Horloge figée : la consigne système porte désormais la date du tour, et un
 * test qui la lirait sur l'horloge réelle changerait de verdict chaque jour.
 * 14 h 30 à Paris, 2 h 30 à Tahiti — de quoi vérifier que le fuseau du profil
 * l'emporte sur celui du serveur.
 */
const NOW = new Date("2026-09-02T12:30:00.000Z");

describe("ConversationService", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "queueMicrotask", "setImmediate"] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("getById", () => {
    it("signale une conversation introuvable plutôt que de renvoyer null", async () => {
      const service = makeService(
        makeRepository({ findById: jest.fn().mockResolvedValue(null) }),
        makeLlm(),
      );

      await expect(service.getById("absente", TOKEN)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("markRead", () => {
    it("délègue la remise à zéro du compteur au dépôt", async () => {
      const repo = makeRepository({
        markRead: jest.fn().mockResolvedValue(makeConversation({ unreadCount: 0 })),
      });

      const conversation = await makeService(repo).markRead("conv-1", TOKEN);

      expect(repo.markRead).toHaveBeenCalledWith("conv-1", TOKEN);
      expect(conversation.unreadCount).toBe(0);
    });
  });

  describe("getOrCreateAssistantChannel", () => {
    it("réutilise le canal permanent existant sans en créer un second", async () => {
      const existing = makeConversation({ id: "canal", kind: "assistant", title: "Jean-Claude" });
      const repo = makeRepository({
        findAssistantChannel: jest.fn().mockResolvedValue(existing),
      });

      const channel = await makeService(repo, makeLlm()).getOrCreateAssistantChannel(USER, TOKEN);

      expect(channel).toBe(existing);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("crée le canal permanent au premier accès", async () => {
      const repo = makeRepository();

      await makeService(repo, makeLlm()).getOrCreateAssistantChannel(USER, TOKEN);

      expect(repo.create).toHaveBeenCalledWith(
        USER,
        { title: "Jean-Claude", folderIds: [] },
        "assistant",
        TOKEN,
      );
    });

    it("titre le canal du nom d'assistant choisi dans les réglages (§4.5)", async () => {
      const repo = makeRepository();

      await makeService(
        repo,
        makeLlm(),
        makeSuggestionRepository(),
        makeFolderRepository(),
        makeUserRepository({}, { preferences: makePreferences({ assistantName: "Marcel" }) }),
      ).getOrCreateAssistantChannel(USER, TOKEN);

      expect(repo.create).toHaveBeenCalledWith(
        USER,
        { title: "Marcel", folderIds: [] },
        "assistant",
        TOKEN,
      );
    });

    it("ouvre l'accueil sur une question plutôt que sur un fil vide (§6.3)", async () => {
      const repo = makeRepository({ listMessages: emptyThread() });

      await makeService(
        repo,
        makeLlm(),
        makeSuggestionRepository(),
        makeFolderRepository(),
        makeUserRepository({}, { onboardingCompletedAt: null }),
      ).getOrCreateAssistantChannel(USER, TOKEN);

      expect(repo.appendMessage).toHaveBeenCalledWith(
        "conv-1",
        USER,
        expect.objectContaining({ role: "assistant" }),
        TOKEN,
      );

      const [, , message] = (repo.appendMessage as jest.Mock).mock.calls[0] as [
        string,
        string,
        { content: string },
        string,
      ];
      // L'accueil doit se présenter et dire qu'il est facultatif : le §6.3
      // demande une étape brève et sautable.
      expect(message.content).toContain("Jean-Claude");
      expect(message.content).toContain("passer cette étape");
    });

    it("relit le canal après l'accueil pour que la pastille reflète le message qui vient d'être posé (§6.3)", async () => {
      const refreshed = makeConversation({ id: "conv-1", kind: "assistant", unreadCount: 1 });
      const repo = makeRepository({
        listMessages: emptyThread(),
        findById: jest.fn().mockResolvedValue(refreshed),
      });

      const channel = await makeService(
        repo,
        makeLlm(),
        makeSuggestionRepository(),
        makeFolderRepository(),
        makeUserRepository({}, { onboardingCompletedAt: null }),
      ).getOrCreateAssistantChannel(USER, TOKEN);

      // `create` renvoie un canal avec un `unreadCount` à 0, capturé avant le
      // message d'accueil : c'est la version relue par `findById`, celle que
      // le trigger vient de mettre à jour, qui doit sortir de la méthode.
      expect(channel).toBe(refreshed);
      expect(repo.findById).toHaveBeenCalledWith("conv-1", TOKEN);
    });

    it("accueille aussi dans un canal déjà ouvert mais resté vide (§6.3)", async () => {
      const repo = makeRepository({
        listMessages: emptyThread(),
        findAssistantChannel: jest
          .fn()
          .mockResolvedValue(makeConversation({ id: "canal", kind: "assistant" })),
      });

      await makeService(
        repo,
        makeLlm(),
        makeSuggestionRepository(),
        makeFolderRepository(),
        makeUserRepository({}, { onboardingCompletedAt: null }),
      ).getOrCreateAssistantChannel(USER, TOKEN);

      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.appendMessage).toHaveBeenCalledWith(
        "canal",
        USER,
        expect.objectContaining({ role: "assistant" }),
        TOKEN,
      );
    });

    it("n'accueille pas deux fois un canal où l'accueil a déjà commencé", async () => {
      const repo = makeRepository({
        findAssistantChannel: jest
          .fn()
          .mockResolvedValue(makeConversation({ id: "canal", kind: "assistant" })),
        listMessages: jest.fn().mockResolvedValue({
          items: [makeMessage({ id: "m1", role: "assistant", content: "Bonjour, moi c'est…" })],
          nextCursor: null,
        }),
      });

      await makeService(
        repo,
        makeLlm(),
        makeSuggestionRepository(),
        makeFolderRepository(),
        makeUserRepository({}, { onboardingCompletedAt: null }),
      ).getOrCreateAssistantChannel(USER, TOKEN);

      expect(repo.appendMessage).not.toHaveBeenCalled();
    });

    it("n'accueille pas une seconde fois un utilisateur déjà passé par là", async () => {
      const repo = makeRepository();

      await makeService(repo, makeLlm()).getOrCreateAssistantChannel(USER, TOKEN);

      expect(repo.appendMessage).not.toHaveBeenCalled();
    });
  });

  describe("streamMessage", () => {
    it("persiste le message de l'utilisateur, interroge le moteur, puis persiste la réponse", async () => {
      const repo = makeRepository();

      const events = await drain(makeService(repo, makeLlm()), {
        content: "Que planter en septembre ?",
        inputMode: "text",
        attachmentIds: [],
      });

      expect(repo.appendMessage).toHaveBeenNthCalledWith(
        1,
        "conv-1",
        USER,
        {
          content: "Que planter en septembre ?",
          inputMode: "text",
          attachmentIds: [],
          role: "user",
        },
        TOKEN,
      );

      // La traçabilité du moteur est conservée par message et non par
      // conversation : le modèle peut changer en cours de fil (§5.1).
      expect(repo.appendMessage).toHaveBeenNthCalledWith(
        2,
        "conv-1",
        USER,
        {
          content: "Voici ce que je propose.",
          inputMode: "text",
          role: "assistant",
          attachmentIds: [],
          provider: "anthropic",
          model: "claude-opus-5",
        },
        TOKEN,
      );

      expect(events.map((e) => e.type)).toEqual(["message", "text", "text", "done"]);
    });

    it("attache au message de l'assistant les réponses qu'il propose", async () => {
      const repo = makeRepository();
      const llm = makeLlm(
        ["On peut prendre ça par plusieurs bouts."],
        [
          {
            id: "call-1",
            name: "ask_question",
            input: {
              question: "Quel type de questions voulez-vous ?",
              choices: ["Vous connaître", "Cadrer un projet", "Creuser un problème"],
            },
          },
        ],
      );

      await drain(makeService(repo, llm));

      expect(repo.appendMessage).toHaveBeenNthCalledWith(
        2,
        "conv-1",
        USER,
        expect.objectContaining({
          role: "assistant",
          choices: ["Vous connaître", "Cadrer un projet", "Creuser un problème"],
        }),
        TOKEN,
      );
    });

    it("prend la question pour texte quand le modèle n'a rien écrit d'autre", async () => {
      const repo = makeRepository();
      const llm = makeLlm(
        [],
        [
          {
            id: "call-1",
            name: "ask_question",
            input: { question: "On part sur quel angle ?", choices: ["Le mien", "Le vôtre"] },
          },
        ],
      );

      await drain(makeService(repo, llm));

      expect(repo.appendMessage).toHaveBeenNthCalledWith(
        2,
        "conv-1",
        USER,
        expect.objectContaining({ content: "On part sur quel angle ?" }),
        TOKEN,
      );
    });

    it("laisse la réponse en texte quand une seule réponse est proposée", async () => {
      // L'appel inexploitable est consigné : on vérifie le comportement, pas le log.
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const repo = makeRepository();
      const llm = makeLlm(
        ["Et sinon ?"],
        [
          {
            id: "call-1",
            name: "ask_question",
            input: { question: "On continue ?", choices: ["Oui"] },
          },
        ],
      );

      await drain(makeService(repo, llm));

      // Une carte de choix à une seule réponse n'est pas un choix : mieux vaut
      // la question posée à l'écrit qu'un bouton unique.
      const call = (repo.appendMessage as jest.Mock).mock.calls[1] as [
        string,
        string,
        Record<string, unknown>,
        string,
      ];
      expect(call[2]["choices"]).toBeUndefined();
      jest.restoreAllMocks();
    });

    it("émet le message de l'utilisateur avant toute génération", async () => {
      // C'est ce qui permet au fil de l'afficher immédiatement, sans attendre
      // le premier jeton du modèle.
      const events = await drain(makeService(makeRepository(), makeLlm()));

      expect(events[0]).toEqual({
        type: "message",
        message: expect.objectContaining({ role: "user" }),
      });
    });

    it("rend la réponse par fragments plutôt qu'en un bloc", async () => {
      const events = await drain(makeService(makeRepository(), makeLlm(["Bon", "jour", " !"])));

      expect(events.filter((e) => e.type === "text")).toEqual([
        { type: "text", text: "Bon" },
        { type: "text", text: "jour" },
        { type: "text", text: " !" },
      ]);
    });

    it("persiste le texte déjà produit si le flux est interrompu", async () => {
      // Le client a fermé l'onglet : la génération s'arrête, mais ce qui a été
      // produit est déjà facturé et doit se retrouver au rechargement.
      const repo = makeRepository();
      const llm = makeLlm(["Première partie", "jamais lue"]);
      const service = makeService(repo, llm);

      const stream = service.streamMessage(
        "conv-1",
        USER,
        { content: "Raconte", inputMode: "text", attachmentIds: [] },
        TOKEN,
      );

      await stream.next(); // message utilisateur
      await stream.next(); // premier fragment
      await stream.return(undefined as never); // l'appelant abandonne

      expect(repo.appendMessage).toHaveBeenNthCalledWith(
        2,
        "conv-1",
        USER,
        expect.objectContaining({ role: "assistant", content: "Première partie" }),
        TOKEN,
      );
    });

    it("signale l'échec quand le modèle n'a rien produit, sans perdre le message de l'utilisateur", async () => {
      // Sonar (§5.1) peut répondre sans erreur technique et sans le moindre
      // appel d'outil : ce silence doit remonter, pas disparaître.
      const repo = makeRepository();

      await expect(drain(makeService(repo, makeLlm([])))).rejects.toMatchObject({ status: 502 });

      // Le message de l'utilisateur reste acquis : seule la réponse manque.
      expect(repo.appendMessage).toHaveBeenCalledTimes(1);
    });

    it("ne rejoue pas les messages système de l'historique comme des tours de dialogue", async () => {
      const llm = makeLlm();
      const repo = makeRepository({
        listMessages: jest.fn().mockResolvedValue({
          items: [
            makeMessage({ id: "m1", role: "system", content: "Consigne interne" }),
            makeMessage({ id: "m2", role: "user", content: "Bonjour" }),
            makeMessage({ id: "m3", role: "assistant", content: "Bonjour !" }),
          ],
          nextCursor: null,
        }),
      });

      await drain(makeService(repo, llm));

      expect(lastRequest(llm).messages).toEqual([
        { role: "user", content: "Bonjour" },
        { role: "assistant", content: "Bonjour !" },
      ]);
    });

    it("borne le canal permanent aux trois sujets prévus (A.10)", async () => {
      const llm = makeLlm();
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
      });

      await drain(makeService(repo, llm), {
        content: "Qu'est-ce qui est important aujourd'hui ?",
        inputMode: "text",
        attachmentIds: [],
      });

      const system = lastRequest(llm).system ?? "";
      expect(system).toContain("réservé à trois sujets");
      expect(system).toContain("conversation dédiée");
    });

    it("conduit l'accueil avant de borner le canal (§6.3)", async () => {
      const llm = makeLlm();

      await drain(
        makeService(
          makeRepository({
            findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
          }),
          llm,
          makeSuggestionRepository(),
          makeFolderRepository(),
          makeUserRepository({}, { onboardingCompletedAt: null }),
        ),
        { content: "Je monte une boîte de menuiserie.", inputMode: "text", attachmentIds: [] },
      );

      const system = lastRequest(llm).system ?? "";
      expect(system).toContain("vient de créer son compte");
      // Le bornage du canal ferait ouvrir une conversation dédiée au premier
      // projet évoqué, alors que l'accueil cherche justement à en entendre parler.
      expect(system).not.toContain("réservé à trois sujets");
      expect(lastRequest(llm).tools?.map((t) => t.name)).toContain("finish_onboarding");
    });

    it("propose des dossiers pour un projet évoqué pendant l'accueil (§12.1)", async () => {
      const llm = makeLlm();

      await drain(
        makeService(
          makeRepository({
            findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
          }),
          llm,
          makeSuggestionRepository(),
          makeFolderRepository(),
          makeUserRepository({}, { onboardingCompletedAt: null }),
        ),
        { content: "Je refais tout mon jardin ce printemps.", inputMode: "text", attachmentIds: [] },
      );

      expect(lastRequest(llm).tools?.map((t) => t.name)).toContain("suggest_project_folders");
    });

    it("enregistre ce que l'accueil a appris et le clôt (§6.3, A.13)", async () => {
      const users = makeUserRepository({}, { onboardingCompletedAt: null });
      const suggestions = makeSuggestionRepository();
      const llm = makeLlm(
        ["Merci, c'est noté."],
        [
          {
            id: "call-1",
            name: "finish_onboarding",
            input: { memory: "Menuisier à son compte, monte son atelier." },
          },
        ],
      );

      await drain(
        makeService(
          makeRepository({
            findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
          }),
          llm,
          suggestions,
          makeFolderRepository(),
          users,
        ),
      );

      expect(users.completeOnboarding).toHaveBeenCalledWith(
        USER,
        "Menuisier à son compte, monte son atelier.",
        TOKEN,
      );
      // Appliqué directement, comme le titre : on ne demande pas à l'utilisateur
      // de valider ce qu'il vient lui-même de raconter.
      expect(suggestions.create).not.toHaveBeenCalled();
    });

    it("ne clôt pas l'accueil sur une mémoire inexploitable", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);

      const users = makeUserRepository({}, { onboardingCompletedAt: null });
      const llm = makeLlm(
        ["Enchanté."],
        [{ id: "call-1", name: "finish_onboarding", input: { memory: "   " } }],
      );

      await drain(
        makeService(
          makeRepository({
            findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
          }),
          llm,
          makeSuggestionRepository(),
          makeFolderRepository(),
          users,
        ),
      );

      expect(users.completeOnboarding).not.toHaveBeenCalled();
    });

    it("n'offre plus de clore l'accueil une fois qu'il a eu lieu", async () => {
      const llm = makeLlm();

      await drain(
        makeService(
          makeRepository({
            findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
          }),
          llm,
        ),
        { content: "Qu'est-ce qui est important aujourd'hui ?", inputMode: "text", attachmentIds: [] },
      );

      expect(lastRequest(llm).tools?.map((t) => t.name)).not.toContain("finish_onboarding");
    });

    it("appelle l'assistant par le nom choisi dans les réglages (§4.5)", async () => {
      const llm = makeLlm();

      await drain(
        makeService(
          makeRepository(),
          llm,
          makeSuggestionRepository(),
          makeFolderRepository(),
          makeUserRepository({}, { preferences: makePreferences({ assistantName: "Marcel" }) }),
        ),
      );

      const system = lastRequest(llm).system ?? "";
      expect(system).toContain("Tu es Marcel");
      expect(system).not.toContain("Jean-Claude");
    });

    it("rappelle au modèle ce qu'il sait déjà de l'utilisateur (§13.4.2)", async () => {
      const llm = makeLlm();

      await drain(
        makeService(
          makeRepository(),
          llm,
          makeSuggestionRepository(),
          makeFolderRepository(),
          makeUserRepository({}, { memory: "Menuisier à son compte." }),
        ),
      );

      expect(lastRequest(llm).system ?? "").toContain("Menuisier à son compte.");
    });

    it("date le tour de dialogue dans le fuseau du profil", async () => {
      const llm = makeLlm();

      await drain(makeService(makeRepository(), llm));

      // Sans ce repère, une échéance déduite de « lundi prochain » tombe sur
      // l'horizon d'entraînement du modèle plutôt que sur le calendrier réel.
      const system = lastRequest(llm).system ?? "";
      expect(system).toContain("mercredi 2 septembre 2026 à 14:30");
      expect(system).toContain("Europe/Paris");
    });

    it("annonce l'heure du fuseau choisi, pas celle du serveur", async () => {
      const llm = makeLlm();

      await drain(
        makeService(
          makeRepository(),
          llm,
          makeSuggestionRepository(),
          makeFolderRepository(),
          makeUserRepository({}, { preferences: makePreferences({ timezone: "Pacific/Tahiti" }) }),
        ),
      );

      expect(lastRequest(llm).system ?? "").toContain("Pacific/Tahiti");
      expect(lastRequest(llm).system ?? "").not.toContain("à 14:30");
    });

    it("garde le tour de dialogue quand le fuseau enregistré est illisible", async () => {
      const llm = makeLlm();
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

      await drain(
        makeService(
          makeRepository(),
          llm,
          makeSuggestionRepository(),
          makeFolderRepository(),
          makeUserRepository({}, { preferences: makePreferences({ timezone: "Terre/Milieu" }) }),
        ),
      );

      // Une consigne datée sur le fuseau par défaut vaut mieux qu'un tour perdu.
      expect(lastRequest(llm).system ?? "").toContain("2 septembre 2026");
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("donne au modèle le nom sous lequel s'adresser à l'utilisateur", async () => {
      const llm = makeLlm();

      await drain(makeService(makeRepository(), llm));

      expect(lastRequest(llm).system ?? "").toContain("L'utilisateur s'appelle Clarisse.");
    });

    it("n'annonce aucun nom quand le profil n'en porte pas", async () => {
      const llm = makeLlm();

      await drain(
        makeService(
          makeRepository(),
          llm,
          makeSuggestionRepository(),
          makeFolderRepository(),
          makeUserRepository({}, { displayName: null }),
        ),
      );

      expect(lastRequest(llm).system ?? "").not.toContain("L'utilisateur s'appelle");
    });

    it("laisse une conversation classique sans bornage de périmètre", async () => {
      const llm = makeLlm();

      await drain(makeService(makeRepository(), llm), {
        content: "Une recette de tarte ?",
        inputMode: "text",
        attachmentIds: [],
      });

      expect(lastRequest(llm).system ?? "").not.toContain("réservé à trois sujets");
    });

    it("expose les outils de suggestion au modèle sans jamais les exécuter (§12.1)", async () => {
      const llm = makeLlm();
      const repo = makeRepository();

      await drain(makeService(repo, llm), {
        content: "Il me faut du terreau et des bulbes.",
        inputMode: "text",
        attachmentIds: [],
      });

      expect(lastRequest(llm).tools?.map((t) => t.name)).toContain("suggest_task_list");
      // Seuls les deux messages du tour sont écrits : aucune todoliste n'est
      // créée à la volée. L'assistant propose, il n'exécute pas.
      expect(repo.appendMessage).toHaveBeenCalledTimes(2);
    });

    it("pousse le modèle à proposer une action après coup, même hors sujet actionnable explicite (A.8)", async () => {
      const llm = makeLlm();

      await drain(makeService(makeRepository(), llm), {
        content: "Il me faut du terreau et des bulbes.",
        inputMode: "text",
        attachmentIds: [],
      });

      // Le trou identifié dans #20 : le modèle ne fait alors que repérer du
      // contenu déjà actionnable, jamais déduire une suite après avoir
      // répondu sur un sujet qui n'en a lui-même rien d'actionnable.
      expect(lastRequest(llm).system ?? "").toContain(
        "Prends aussi les devants une fois la réponse donnée",
      );
    });

    it("ne propose pas de compléter une liste quand le fil n'en a produit aucune", async () => {
      const llm = makeLlm();

      await drain(makeService(makeRepository(), llm), {
        content: "Il me faut des courses pour samedi.",
        inputMode: "text",
        attachmentIds: [],
      });

      // Sans liste à compléter, l'outil n'aurait aucun identifiant à recevoir
      // et le modèle en inventerait un.
      const tools = lastRequest(llm).tools?.map((t) => t.name) ?? [];
      expect(tools).toContain("suggest_task_list");
      expect(tools).not.toContain("suggest_task_list_items");
    });

    it("donne au modèle de quoi compléter une liste déjà née du fil", async () => {
      const llm = makeLlm();
      const list = makeTaskList({
        tasks: [
          makeTaskListItem({ id: "task-1", title: "Pain" }),
          makeTaskListItem({ id: "task-2", title: "Lait", parentId: "task-1" }),
        ],
      });

      await drain(
        makeService(
          makeRepository(),
          llm,
          makeSuggestionRepository(),
          makeFolderRepository(),
          makeUserRepository(),
          makeCalendarRepository(),
          makeTaskRepository([list]),
        ),
        { content: "Complète la liste.", inputMode: "text", attachmentIds: [] },
      );

      const tools = lastRequest(llm).tools?.map((t) => t.name) ?? [];
      expect(tools).toContain("suggest_task_list_items");

      // Sans le contenu ni l'identifiant, « complète la liste » n'a rien à
      // désigner : le modèle rappelle l'outil de création et propose une
      // seconde liste homonyme.
      const system = lastRequest(llm).system ?? "";
      expect(system).toContain(list.id);
      expect(system).toContain("Pain");
      expect(system).toContain("> Lait");
    });

    it("rappelle au modèle de ne pas reproposer ce qui a déjà été accepté", async () => {
      const llm = makeLlm();
      const suggestions = makeSuggestionRepository({
        listForConversation: jest
          .fn()
          .mockResolvedValue([
            makeSuggestion({
              kind: "create_task_list",
              status: "accepted",
              message: "Je te l'organise ?",
            }),
          ]),
      });

      await drain(makeService(makeRepository(), llm, suggestions), {
        content: "Complète la liste.",
        inputMode: "text",
        attachmentIds: [],
      });

      const system = lastRequest(llm).system ?? "";
      expect(system).toContain("Ne repropose ni ce qui a été accepté");
    });

    it("n'expose au canal permanent que les outils de son périmètre (A.10)", async () => {
      const llm = makeLlm();
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
      });

      await drain(makeService(repo, llm), {
        content: "Aide-moi à ranger mon espace.",
        inputMode: "text",
        attachmentIds: [],
      });

      const tools = lastRequest(llm).tools?.map((t) => t.name) ?? [];
      expect(tools).toContain("suggest_project_folders");
      expect(tools).toContain("open_new_conversation");
      expect(tools).not.toContain("suggest_task_list");
    });

    it("transforme un appel d'outil en proposition en attente (§12.1)", async () => {
      const suggestions = makeSuggestionRepository();
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
      });
      const llm = makeLlm(
        ["Je peux structurer ça."],
        [
          {
            id: "call-1",
            name: "suggest_project_folders",
            input: {
              message: "Je te crée un dossier Jardin ?",
              folders: [{ name: "Jardin", children: [{ name: "ACHAT", purpose: "purchase" }] }],
            },
          },
        ],
      );

      await drain(makeService(repo, llm, suggestions), {
        content: "Je me lance dans le jardin.",
        inputMode: "text",
        attachmentIds: [],
      });

      expect(suggestions.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({
          conversationId: "conv-1",
          kind: "create_project_folders",
          message: "Je te crée un dossier Jardin ?",
        }),
        TOKEN,
      );

      // La proposition est écrite, les dossiers ne le sont pas : le tour n'a
      // produit que les deux messages du dialogue.
      expect(repo.appendMessage).toHaveBeenCalledTimes(2);
    });

    it("capture les suggestions suivantes même quand l'une d'elles échoue à s'enregistrer", async () => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      const suggestions = makeSuggestionRepository({
        create: jest
          .fn()
          .mockRejectedValueOnce(new Error("contrainte de la table non satisfaite"))
          .mockResolvedValue(makeSuggestion()),
      });
      const llm = makeLlm(
        ["Je m'en occupe."],
        [
          {
            id: "call-1",
            name: "suggest_task_list",
            input: {
              message: "Je t'organise les achats ?",
              lists: [{ title: "Achats jardin", kind: "shopping", items: [{ title: "Terreau" }] }],
            },
          },
          {
            id: "call-2",
            name: "suggest_folders",
            input: { message: "Je range ça dans Jardin ?", newFolders: [{ name: "Jardin" }] },
          },
        ],
      );

      const events = await drain(makeService(makeRepository(), llm, suggestions), {
        content: "Je me lance dans le jardin.",
        inputMode: "text",
        attachmentIds: [],
      });

      // Sans isolement, l'échec de la première capture aurait interrompu la
      // boucle et emporté avec lui la seconde proposition, jamais capturée —
      // exactement le symptôme rapporté (« l'IA ne propose que le 1er choix »).
      expect(suggestions.create).toHaveBeenCalledTimes(2);
      expect(suggestions.create).toHaveBeenNthCalledWith(
        2,
        USER,
        expect.objectContaining({ kind: "assign_folders" }),
        TOKEN,
      );
      // Le tour reste exploitable malgré l'échec : la réponse est bien écrite.
      expect(events.some((event) => event.type === "done")).toBe(true);
      jest.restoreAllMocks();
    });

    it("propose la bascule sans ouvrir la conversation dédiée (A.10)", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
      });
      const llm = makeLlm(
        [],
        [
          {
            id: "call-1",
            name: "open_new_conversation",
            input: { title: "Itinéraire en Bretagne" },
          },
        ],
      );

      await drain(makeService(repo, llm), {
        content: "Propose-moi un itinéraire de 5 jours en Bretagne.",
        inputMode: "text",
        attachmentIds: [],
      });

      // Rien n'est ouvert tant que l'utilisateur n'a pas validé : la
      // proposition voyage sur le message qui l'annonce.
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.appendMessage).toHaveBeenLastCalledWith(
        "conv-1",
        USER,
        expect.objectContaining({
          role: "assistant",
          redirectTitle: "Itinéraire en Bretagne",
        }),
        TOKEN,
      );
    });

    it("annonce la bascule dans les mêmes termes, quoi qu'écrive le modèle", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
      });
      const llm = makeLlm(
        ["Alors, pour la Bretagne, je te conseille de commencer par Saint-Malo…"],
        [
          {
            id: "call-1",
            name: "open_new_conversation",
            input: { title: "Itinéraire en Bretagne" },
          },
        ],
      );

      await drain(makeService(repo, llm), {
        content: "Propose-moi un itinéraire de 5 jours en Bretagne.",
        inputMode: "text",
        attachmentIds: [],
      });

      // C'est ce message qui porte la validation : il doit être le même à
      // chaque bascule, et non le début d'une réponse hors périmètre.
      expect(repo.appendMessage).toHaveBeenLastCalledWith(
        "conv-1",
        USER,
        expect.objectContaining({
          content: "Ce sujet mérite une conversation dédiée. On y bascule ?",
        }),
        TOKEN,
      );
    });

    it("ne transforme pas la bascule en proposition à valider", async () => {
      const suggestions = makeSuggestionRepository();
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
      });
      const llm = makeLlm(
        ["J'ouvre un fil dédié."],
        [{ id: "call-1", name: "open_new_conversation", input: { title: "Recette de tarte" } }],
      );

      await drain(makeService(repo, llm, suggestions), {
        content: "Une recette de tarte aux pommes ?",
        inputMode: "text",
        attachmentIds: [],
      });

      expect(suggestions.create).not.toHaveBeenCalled();
    });

    it("reste dans le canal quand le titre de bascule est inexploitable", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
      });
      const llm = makeLlm(
        ["Je regarde ça."],
        [{ id: "call-1", name: "open_new_conversation", input: { title: "   " } }],
      );

      await drain(makeService(repo, llm), { content: "?", inputMode: "text", attachmentIds: [] });

      // Proposer un fil sans titre serait plus déroutant que de ne pas basculer.
      expect(repo.appendMessage).toHaveBeenLastCalledWith(
        "conv-1",
        USER,
        expect.objectContaining({ content: "Je regarde ça." }),
        TOKEN,
      );
      jest.restoreAllMocks();
    });

    it("ouvre la conversation dédiée une fois la bascule validée", async () => {
      const proposal = makeMessage({
        id: "msg-switch",
        role: "assistant",
        content: "Ce sujet mérite une conversation dédiée. On y bascule ?",
        redirectTitle: "Itinéraire en Bretagne",
      });
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
        findMessage: jest.fn().mockResolvedValue(proposal),
        create: jest
          .fn()
          .mockResolvedValue(makeConversation({ id: "conv-2", title: "Itinéraire en Bretagne" })),
      });

      const conversation = await makeService(repo).switchToDedicatedConversation(
        "conv-1",
        USER,
        "msg-switch",
        TOKEN,
      );

      expect(conversation.id).toBe("conv-2");
      expect(repo.create).toHaveBeenCalledWith(
        USER,
        { title: "Itinéraire en Bretagne", folderIds: [] },
        "chat",
        TOKEN,
      );
      expect(repo.acceptRedirect).toHaveBeenCalledWith("msg-switch", TOKEN);
    });

    it("refuse de basculer depuis un message qui ne le propose pas", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
        findMessage: jest
          .fn()
          .mockResolvedValue(makeMessage({ id: "msg-1", role: "assistant", content: "Bonjour." })),
      });

      await expect(
        makeService(repo).switchToDedicatedConversation("conv-1", USER, "msg-1", TOKEN),
      ).rejects.toThrow();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("retire du contexte l'échange déjà basculé", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
        listMessages: jest.fn().mockResolvedValue({
          items: [
            makeMessage({
              id: "msg-1",
              role: "user",
              content: "Un itinéraire en Bretagne ?",
              createdAt: "2026-09-02T08:00:00.000Z",
            }),
            makeMessage({
              id: "msg-2",
              role: "assistant",
              content: "Ce sujet mérite une conversation dédiée. On y bascule ?",
              redirectTitle: "Itinéraire en Bretagne",
              redirectAcceptedAt: "2026-09-02T08:00:10.000Z",
              createdAt: "2026-09-02T08:00:05.000Z",
            }),
            makeMessage({
              id: "msg-3",
              role: "user",
              content: "Qu'est-ce que j'ai cette semaine ?",
              createdAt: "2026-09-02T09:00:00.000Z",
            }),
          ],
          nextCursor: null,
        }),
      });
      const llm = makeLlm();

      await drain(makeService(repo, llm), {
        content: "Qu'est-ce que j'ai cette semaine ?",
        inputMode: "text",
        attachmentIds: [],
      });

      // La réponse se donne dans l'autre fil : la relire ici ferait revenir le
      // canal sur un sujet dont il vient de se dessaisir.
      expect(lastRequest(llm).messages).toEqual([
        { role: "user", content: "Qu'est-ce que j'ai cette semaine ?" },
      ]);
    });

    describe("pièces jointes", () => {
      function withAttachments(
        attachments: IAttachmentRepository,
        repo: IConversationRepository = makeRepository(),
        users: IUserRepository = makeUserRepository(),
      ): ConversationService {
        return makeService(
          repo,
          makeLlm(),
          makeSuggestionRepository(),
          makeFolderRepository(),
          users,
          makeCalendarRepository(),
          makeTaskRepository(),
          attachments,
        );
      }

      it("refuse une pièce jointe si le modèle actif ne lit pas les images, avant toute écriture", async () => {
        const repo = makeRepository();
        const attachments = makeAttachmentRepository({
          findByIds: jest.fn().mockResolvedValue([makeAttachment()]),
        });

        await expect(
          drain(withAttachments(attachments, repo), {
            content: "",
            inputMode: "text",
            attachmentIds: ["att-1"],
          }),
        ).rejects.toMatchObject({ status: 422 });
        expect(repo.appendMessage).not.toHaveBeenCalled();
      });

      it("refuse une pièce jointe introuvable", async () => {
        const repo = makeRepository();
        const attachments = makeAttachmentRepository({ findByIds: jest.fn().mockResolvedValue([]) });

        await expect(
          drain(withAttachments(attachments, repo), {
            content: "",
            inputMode: "text",
            attachmentIds: ["att-inconnu"],
          }),
        ).rejects.toMatchObject({ status: 404 });
        expect(repo.appendMessage).not.toHaveBeenCalled();
      });

      it("refuse une pièce jointe déjà envoyée dans un autre message", async () => {
        const repo = makeRepository();
        const attachments = makeAttachmentRepository({
          findByIds: jest.fn().mockResolvedValue([makeAttachment({ messageId: "msg-autre" })]),
        });

        await expect(
          drain(withAttachments(attachments, repo), {
            content: "",
            inputMode: "text",
            attachmentIds: ["att-1"],
          }),
        ).rejects.toMatchObject({ status: 409 });
        expect(repo.appendMessage).not.toHaveBeenCalled();
      });

      it("accepte une image seule, sans texte, avec un modèle qui lit les images", async () => {
        const repo = makeRepository();
        const attachment = makeAttachment();
        const attachments = makeAttachmentRepository({
          findByIds: jest.fn().mockResolvedValue([attachment]),
        });
        const users = makeUserRepository(
          {},
          { preferences: makePreferences({ llmModel: "mistral/mistral-medium-3.5" }) },
        );

        const events = await drain(withAttachments(attachments, repo, users), {
          content: "",
          inputMode: "text",
          attachmentIds: ["att-1"],
        });

        // Fusionnées manuellement : pas encore liées en base à cet instant —
        // sans cela, la vignette apparaîtrait puis disparaîtrait jusqu'au
        // rechargement suivant.
        expect(events[0]).toEqual({
          type: "message",
          message: expect.objectContaining({ attachments: [attachment] }),
        });
        expect(attachments.linkToMessage).toHaveBeenCalledWith(["att-1"], "msg-user", TOKEN);
      });

      it("n'interrompt pas le tour si la liaison des pièces jointes échoue", async () => {
        const repo = makeRepository();
        const attachments = makeAttachmentRepository({
          findByIds: jest.fn().mockResolvedValue([makeAttachment()]),
          linkToMessage: jest.fn().mockRejectedValue(new Error("indisponible")),
        });
        const users = makeUserRepository(
          {},
          { preferences: makePreferences({ llmModel: "mistral/mistral-medium-3.5" }) },
        );

        const events = await drain(withAttachments(attachments, repo, users), {
          content: "",
          inputMode: "text",
          attachmentIds: ["att-1"],
        });

        expect(events.at(-1)?.type).toBe("done");
      });

      it("accepte un PDF seul, même avec un modèle qui ne lit pas les images", async () => {
        const repo = makeRepository();
        const attachment = makeAttachment({
          mimeType: "application/pdf",
          fileName: "contrat.pdf",
          extractedText: "Préavis de deux mois.",
        });
        const attachments = makeAttachmentRepository({
          findByIds: jest.fn().mockResolvedValue([attachment]),
        });

        const events = await drain(withAttachments(attachments, repo), {
          content: "",
          inputMode: "text",
          attachmentIds: ["att-1"],
        });

        expect(events[0]).toEqual({
          type: "message",
          message: expect.objectContaining({ attachments: [attachment] }),
        });
      });

      it("place le texte extrait d'un PDF avant le texte du message, dans une seule partie texte", async () => {
        const repo = makeRepository({
          listMessages: jest.fn().mockResolvedValue({
            items: [
              makeMessage({
                id: "msg-user",
                role: "user",
                content: "Voici mon bail.",
                attachments: [
                  makeAttachment({
                    mimeType: "application/pdf",
                    fileName: "contrat.pdf",
                    extractedText: "Préavis de deux mois.",
                  }),
                ],
              }),
            ],
            nextCursor: null,
          }),
        });
        const llm = makeLlm();

        await drain(makeService(repo, llm), { content: "?", inputMode: "text", attachmentIds: [] });

        expect(lastRequest(llm).messages).toEqual([
          {
            role: "user",
            content: [{ type: "text", text: "Voici mon bail.\n\n--- contrat.pdf ---\nPréavis de deux mois." }],
          },
        ]);
      });

      it("combine le texte extrait d'un PDF et une image dans le même message", async () => {
        const repo = makeRepository({
          listMessages: jest.fn().mockResolvedValue({
            items: [
              makeMessage({
                id: "msg-user",
                role: "user",
                content: "Voici mon bail et une photo du logement.",
                attachments: [
                  makeAttachment({
                    id: "att-pdf",
                    mimeType: "application/pdf",
                    fileName: "contrat.pdf",
                    extractedText: "Préavis de deux mois.",
                  }),
                  makeAttachment({
                    id: "att-img",
                    url: "https://storage.example/att-img.png",
                    mimeType: "image/png",
                  }),
                ],
              }),
            ],
            nextCursor: null,
          }),
        });
        const llm = makeLlm();

        await drain(makeService(repo, llm), { content: "?", inputMode: "text", attachmentIds: [] });

        expect(lastRequest(llm).messages).toEqual([
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Voici mon bail et une photo du logement.\n\n--- contrat.pdf ---\nPréavis de deux mois.",
              },
              { type: "image", url: "https://storage.example/att-img.png", mediaType: "image/png" },
            ],
          },
        ]);
      });

      it("accepte un fichier texte seul, même avec un modèle qui ne lit pas les images", async () => {
        const repo = makeRepository();
        const attachment = makeAttachment({
          mimeType: "text/plain",
          fileName: "notes.txt",
          extractedText: "Liste de courses : pain, lait.",
        });
        const attachments = makeAttachmentRepository({
          findByIds: jest.fn().mockResolvedValue([attachment]),
        });

        const events = await drain(withAttachments(attachments, repo), {
          content: "",
          inputMode: "text",
          attachmentIds: ["att-1"],
        });

        expect(events[0]).toEqual({
          type: "message",
          message: expect.objectContaining({ attachments: [attachment] }),
        });
      });

      it("place le texte d'un fichier texte brut dans le contexte, jamais comme une partie image", async () => {
        const repo = makeRepository({
          listMessages: jest.fn().mockResolvedValue({
            items: [
              makeMessage({
                id: "msg-user",
                role: "user",
                content: "Voici mes notes.",
                attachments: [
                  makeAttachment({
                    mimeType: "text/plain",
                    fileName: "notes.txt",
                    extractedText: "Liste de courses : pain, lait.",
                  }),
                ],
              }),
            ],
            nextCursor: null,
          }),
        });
        const llm = makeLlm();

        await drain(makeService(repo, llm), { content: "?", inputMode: "text", attachmentIds: [] });

        expect(lastRequest(llm).messages).toEqual([
          {
            role: "user",
            content: [
              { type: "text", text: "Voici mes notes.\n\n--- notes.txt ---\nListe de courses : pain, lait." },
            ],
          },
        ]);
      });
    });
  });

  describe("réponse écrite malgré un appel d'outil (§12.1)", () => {
    /** Une proposition de todoliste valide, telle que le modèle la rend. */
    const SUGGESTION: LlmToolCall = {
      id: "call-1",
      name: "suggest_task_list",
      input: {
        message: "Je te fais la liste du rempotage ?",
        lists: [{ title: "Rempotage", kind: "todo", items: [{ title: "Acheter du terreau" }] }],
      },
    };

    it("répond quand le modèle s'en est tenu à son appel d'outil", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const repo = makeRepository();
      const llm = makeLlmTurns([
        { toolCalls: [SUGGESTION] },
        { chunks: ["Il te faut ", "du terreau."] },
      ]);

      await drain(makeService(repo, llm), {
        content: "Que faut-il pour rempoter ?",
        inputMode: "text",
        attachmentIds: [],
      });

      // Sans ce second tour, la carte s'affichait seule et la question restait
      // sans réponse : l'utilisateur voyait sa demande ignorée.
      expect(callCount(llm)).toBe(2);
      expect(repo.appendMessage).toHaveBeenNthCalledWith(
        2,
        "conv-1",
        USER,
        expect.objectContaining({ content: "Il te faut du terreau." }),
        TOKEN,
      );
      jest.restoreAllMocks();
    });

    it("rappelle au second tour la proposition déjà affichée, sans lui rendre les outils", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const llm = makeLlmTurns([{ toolCalls: [SUGGESTION] }, { chunks: ["Voilà."] }]);

      await drain(makeService(makeRepository(), llm));

      const retry = requestAt(llm, 1);
      // Sans outils : la proposition du premier tour sera captée de toute
      // façon, la rejouer afficherait deux cartes pour un seul geste.
      expect(retry.tools).toEqual([]);
      expect(retry.system ?? "").toContain("Je te fais la liste du rempotage ?");
      jest.restoreAllMocks();
    });

    it("ne rappelle pas le modèle quand il a déjà écrit sa réponse", async () => {
      const llm = makeLlmTurns([{ chunks: ["Bien sûr."], toolCalls: [SUGGESTION] }]);

      await drain(makeService(makeRepository(), llm));

      expect(callCount(llm)).toBe(1);
    });

    it("ne rappelle pas le modèle quand la question porte déjà les réponses", async () => {
      const llm = makeLlmTurns([
        {
          toolCalls: [
            {
              id: "call-1",
              name: "ask_question",
              input: { question: "On part sur quel angle ?", choices: ["Le mien", "Le vôtre"] },
            },
          ],
        },
      ]);

      await drain(makeService(makeRepository(), llm));

      // La question est affichée telle quelle : un second tour la doublerait.
      expect(callCount(llm)).toBe(1);
    });

    it("ne rappelle pas le modèle quand la bascule est annoncée (A.10)", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
      });
      const llm = makeLlmTurns([
        {
          toolCalls: [
            { id: "call-1", name: "open_new_conversation", input: { title: "Recette de tarte" } },
          ],
        },
      ]);

      await drain(makeService(repo, llm));

      // L'annonce de bascule vient du serveur : le modèle doit justement se
      // taire, et la réponse sera donnée dans l'autre fil.
      expect(callCount(llm)).toBe(1);
    });

    it("garde la proposition quand le rattrapage échoue", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      const suggestions = makeSuggestionRepository();
      const repo = makeRepository();
      const llm = makeLlmTurns([{ toolCalls: [SUGGESTION] }, { fails: true }]);

      await drain(makeService(repo, llm, suggestions));

      // Le tour reste exploitable sans le second texte ; le faire échouer
      // perdrait la proposition avec lui.
      expect(suggestions.create).toHaveBeenCalled();
      expect(repo.appendMessage).toHaveBeenCalledTimes(1);
      jest.restoreAllMocks();
    });
  });

  describe("correction et reprise d'un tour", () => {
    /** Déroule un générateur de tour, comme le fait le controller. */
    async function collect(
      events: AsyncGenerator<MessageStreamEvent>,
    ): Promise<MessageStreamEvent[]> {
      const collected: MessageStreamEvent[] = [];
      for await (const event of events) collected.push(event);
      return collected;
    }

    const history = (...items: Message[]) =>
      jest.fn().mockResolvedValue({ items, nextCursor: null });

    it("efface la suite du fil avant de rejouer un message corrigé", async () => {
      const question = makeMessage({
        id: "msg-1",
        role: "user",
        content: "Une recette de tarte ?",
        createdAt: "2026-09-02T08:00:00.000Z",
      });
      const repo = makeRepository({
        findMessage: jest.fn().mockResolvedValue(question),
        listMessages: history(
          makeMessage({ id: "msg-1", role: "user", content: "Une recette de tarte aux poires ?" }),
        ),
      });

      const events = await collect(
        makeService(repo).editMessage(
          "conv-1",
          USER,
          "msg-1",
          { content: "Une recette de tarte aux poires ?" },
          TOKEN,
        ),
      );

      // Ce qui suivait répondait au texte d'avant : le garder ferait un fil
      // qui se contredit.
      expect(repo.deleteMessagesAfter).toHaveBeenCalledWith(
        "conv-1",
        "2026-09-02T08:00:00.000Z",
        TOKEN,
      );
      expect(repo.updateMessageContent).toHaveBeenCalledWith(
        "msg-1",
        "Une recette de tarte aux poires ?",
        TOKEN,
      );
      expect(events[0]).toEqual({
        type: "message",
        message: expect.objectContaining({ content: "Une recette de tarte aux poires ?" }),
      });
      expect(events.at(-1)?.type).toBe("done");
    });

    it("refuse de corriger une réponse de l'assistant", async () => {
      const repo = makeRepository({
        findMessage: jest
          .fn()
          .mockResolvedValue(makeMessage({ id: "msg-2", role: "assistant", content: "Voilà." })),
      });

      await expect(
        collect(
          makeService(repo).editMessage("conv-1", USER, "msg-2", { content: "Autre chose" }, TOKEN),
        ),
      ).rejects.toThrow();
      expect(repo.updateMessageContent).not.toHaveBeenCalled();
    });

    it("remplace la réponse rejouée plutôt que de la doubler", async () => {
      const answer = makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "Voilà une première réponse.",
        createdAt: "2026-09-02T08:00:05.000Z",
      });
      const repo = makeRepository({
        findMessage: jest.fn().mockResolvedValue(answer),
        listMessages: history(
          makeMessage({ id: "msg-1", role: "user", content: "Une recette de tarte ?" }),
        ),
      });

      const events = await collect(makeService(repo).retryMessage("conv-1", USER, "msg-2", TOKEN));

      expect(repo.deleteMessagesAfter).toHaveBeenCalledWith(
        "conv-1",
        "2026-09-02T08:00:05.000Z",
        TOKEN,
      );
      expect(repo.deleteMessage).toHaveBeenCalledWith("msg-2", TOKEN);
      expect(events.at(-1)?.type).toBe("done");
    });

    it("garde la demande quand c'est elle qu'on rejoue", async () => {
      const question = makeMessage({
        id: "msg-1",
        role: "user",
        content: "Une recette de tarte ?",
        createdAt: "2026-09-02T08:00:00.000Z",
      });
      const repo = makeRepository({
        findMessage: jest.fn().mockResolvedValue(question),
        listMessages: history(question),
      });

      await collect(makeService(repo).retryMessage("conv-1", USER, "msg-1", TOKEN));

      expect(repo.deleteMessage).not.toHaveBeenCalled();
    });

    it("refuse de rejouer un message d'une autre conversation", async () => {
      const repo = makeRepository({
        findMessage: jest.fn().mockResolvedValue(
          makeMessage({
            id: "msg-9",
            conversationId: "conv-9",
            role: "user",
            content: "Ailleurs",
          }),
        ),
      });

      await expect(
        collect(makeService(repo).retryMessage("conv-1", USER, "msg-9", TOKEN)),
      ).rejects.toThrow();
      expect(repo.deleteMessagesAfter).not.toHaveBeenCalled();
    });

    it("refuse de rejouer quand il ne reste rien à quoi répondre", async () => {
      const answer = makeMessage({
        id: "msg-1",
        role: "assistant",
        content: "Bonjour, moi c'est Jean-Claude.",
        createdAt: "2026-09-02T08:00:00.000Z",
      });
      const repo = makeRepository({
        findMessage: jest.fn().mockResolvedValue(answer),
        listMessages: history(),
      });

      await expect(
        collect(makeService(repo).retryMessage("conv-1", USER, "msg-1", TOKEN)),
      ).rejects.toThrow();
    });

    it("refuse de corriger un message dont le modèle actif ne lit plus les images", async () => {
      const question = makeMessage({
        id: "msg-1",
        role: "user",
        content: "Regarde cette photo.",
        createdAt: "2026-09-02T08:00:00.000Z",
        attachments: [makeAttachment()],
      });
      const repo = makeRepository({ findMessage: jest.fn().mockResolvedValue(question) });

      await expect(
        collect(
          makeService(
            repo,
            makeLlm(),
            makeSuggestionRepository(),
            makeFolderRepository(),
            makeUserRepository(),
            makeCalendarRepository(),
            makeTaskRepository(),
            makeAttachmentRepository(),
          ).editMessage("conv-1", USER, "msg-1", { content: "Et celle-là ?" }, TOKEN),
        ),
      ).rejects.toMatchObject({ status: 422 });
      expect(repo.updateMessageContent).not.toHaveBeenCalled();
    });

    it("refuse de rejouer un message dont le modèle actif ne lit plus les images", async () => {
      const question = makeMessage({
        id: "msg-1",
        role: "user",
        content: "Regarde cette photo.",
        createdAt: "2026-09-02T08:00:00.000Z",
        attachments: [makeAttachment()],
      });
      const repo = makeRepository({ findMessage: jest.fn().mockResolvedValue(question) });

      await expect(
        collect(
          makeService(
            repo,
            makeLlm(),
            makeSuggestionRepository(),
            makeFolderRepository(),
            makeUserRepository(),
            makeCalendarRepository(),
            makeTaskRepository(),
            makeAttachmentRepository(),
          ).retryMessage("conv-1", USER, "msg-1", TOKEN),
        ),
      ).rejects.toMatchObject({ status: 422 });
      expect(repo.deleteMessagesAfter).not.toHaveBeenCalled();
    });
  });

  describe("entretien du fil", () => {
    const untitled = () =>
      makeRepository({
        findById: jest
          .fn()
          .mockResolvedValue(makeConversation({ title: DEFAULT_CONVERSATION_TITLE })),
      });

    it("propose de nommer un fil encore intitulé par défaut", async () => {
      const llm = makeLlm();

      await drain(makeService(untitled(), llm));

      expect(lastRequest(llm).tools?.map((t) => t.name)).toContain("name_conversation");
    });

    it("n'offre plus de nommer un fil qui porte déjà un titre", async () => {
      const llm = makeLlm();

      await drain(makeService(makeRepository(), llm));

      expect(lastRequest(llm).tools?.map((t) => t.name)).not.toContain("name_conversation");
    });

    it("applique le titre sans passer par une proposition à valider (§5.2)", async () => {
      const repo = untitled();
      const suggestions = makeSuggestionRepository();
      const llm = makeLlm(
        ["Bien noté."],
        [{ id: "call-1", name: "name_conversation", input: { title: "Travaux du jardin" } }],
      );

      await drain(makeService(repo, llm, suggestions));

      expect(repo.update).toHaveBeenCalledWith("conv-1", { title: "Travaux du jardin" }, TOKEN);
      // Le titre est le libellé du fil, pas une donnée créée pour l'utilisateur :
      // il ne relève pas du §12.1.
      expect(suggestions.create).not.toHaveBeenCalled();
    });

    it("donne au modèle les dossiers existants quand le fil n'est rangé nulle part", async () => {
      const llm = makeLlm();
      const folders = makeFolderRepository([
        makeFolder({ id: "folder-1", name: "Santé" }),
        makeFolder({ id: "folder-2", name: "Assurances", parentId: "folder-1" }),
        makeFolder({ id: "folder-3", name: "Mutuelle", parentId: "folder-2" }),
      ]);

      await drain(makeService(makeRepository(), llm, makeSuggestionRepository(), folders));

      const request = lastRequest(llm);
      expect(request.tools?.map((t) => t.name)).toContain("suggest_folders");
      // Sans les identifiants, le modèle ne pourrait proposer que des dossiers
      // neufs et rouvrirait « Santé » à chaque conversation.
      expect(request.system ?? "").toContain("Santé (folder-1)");
      expect(request.system ?? "").toContain("Santé > Assurances (folder-2)");
      // L'arborescence descend jusqu'à MAX_FOLDER_DEPTH : s'arrêter au deuxième
      // niveau rendrait les dossiers profonds inutilisables.
      expect(request.system ?? "").toContain("Santé > Assurances > Mutuelle (folder-3)");
    });

    it("demande explicitement de nommer et de ranger, sans compter sur les seuls outils", async () => {
      const llm = makeLlm();

      await drain(makeService(untitled(), llm));

      const system = lastRequest(llm).system ?? "";
      expect(system).toContain("`name_conversation`");
      expect(system).toContain("`suggest_folders`");
    });

    it("continue d'offrir le rangement à un fil déjà classé, pour le cas où on demande de le revoir", async () => {
      const llm = makeLlm();
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeConversation({ folderIds: ["folder-1"] })),
      });

      await drain(makeService(repo, llm));

      // Sinon « déplace-la plutôt dans Documents » n'aurait aucun outil à sa
      // portée une fois le premier rangement fait (§12.1).
      expect(lastRequest(llm).tools?.map((t) => t.name)).toContain("suggest_folders");
    });

    it("dit au modèle le rangement actuel d'un fil déjà classé, et de n'y revenir que sur demande explicite", async () => {
      const llm = makeLlm();
      const folders = makeFolderRepository([
        makeFolder({ id: "folder-1", name: "Projet professionnel" }),
      ]);
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeConversation({ folderIds: ["folder-1"] })),
      });

      await drain(makeService(repo, llm, makeSuggestionRepository(), folders));

      const system = lastRequest(llm).system ?? "";
      expect(system).toContain("Elle est déjà rangée dans Projet professionnel.");
      expect(system).toContain("que si l'utilisateur demande explicitement");
      // L'outil remplace le rangement en entier : le modèle doit savoir qu'un
      // dossier actuel omis de l'appel en est retiré.
      expect(system).toContain("un dossier actuel absent de l'appel en");
    });

    it("ne relance pas un rangement tant que la proposition précédente attend", async () => {
      const llm = makeLlm();
      const suggestions = makeSuggestionRepository({
        listForConversation: jest
          .fn()
          .mockResolvedValue([{ id: "sug-1", kind: "assign_folders", status: "pending" }]),
      });

      await drain(makeService(makeRepository(), llm, suggestions));

      // Sinon chaque message empilerait une carte sur un geste que
      // l'utilisateur a simplement laissé venir.
      expect(lastRequest(llm).tools?.map((t) => t.name)).not.toContain("suggest_folders");
    });
  });

  describe("dossiers proposés au rangement (§5.2, A.1)", () => {
    // De vrais UUID : la charge utile écarte tout identifiant qui n'en est pas
    // un, et un libellé de fixture passerait pour un dossier inventé.
    const TAXES = "11111111-1111-4111-8111-111111111111";
    const OTHER = "22222222-2222-4222-8222-222222222222";

    /** Le rangement tel que le modèle le rend, dossiers existants et nouveaux compris. */
    function filing(existingFolders: unknown, newFolders: unknown[] = []): LlmToolCall {
      return {
        id: "call-1",
        name: "suggest_folders",
        input: { message: "Je range ça où il faut ?", existingFolders, newFolders },
      };
    }

    /** Charge utile de la proposition effectivement enregistrée. */
    function capturedPayload(suggestions: ISuggestionRepository): Record<string, unknown> {
      const call = (suggestions.create as jest.Mock).mock.calls[0] as [
        string,
        { payload: Record<string, unknown> },
        string,
      ];
      return call[1].payload;
    }

    it("écarte le dossier dont le nom contredit l'identifiant", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const suggestions = makeSuggestionRepository();
      const folders = makeFolderRepository([
        makeFolder({ id: TAXES, name: "Impôts" }),
        makeFolder({ id: OTHER, name: "Environnement" }),
      ]);
      const llm = makeLlm(
        ["Je te range ça."],
        [
          filing([
            { id: TAXES, name: "Impôts" },
            { id: OTHER, name: "Impôts" },
          ]),
        ],
      );

      await drain(makeService(makeRepository(), llm, suggestions, folders), {
        content: "C'est quand la date de déclaration ?",
        inputMode: "text",
        attachmentIds: [],
      });

      // Un identifiant recopié de travers tombe sur un autre dossier réel : la
      // proposition paraît sensée alors qu'elle range la conversation ailleurs.
      expect(capturedPayload(suggestions)["existingFolderIds"]).toEqual([TAXES]);
      jest.restoreAllMocks();
    });

    it("accepte un dossier désigné par son chemin complet", async () => {
      const suggestions = makeSuggestionRepository();
      const folders = makeFolderRepository([
        makeFolder({ id: TAXES, name: "Administratif" }),
        makeFolder({ id: OTHER, name: "Assurances", parentId: TAXES }),
      ]);
      const llm = makeLlm(
        ["Je te range ça."],
        [filing([{ id: OTHER, name: "Administratif > Assurances" }])],
      );

      await drain(makeService(makeRepository(), llm, suggestions, folders));

      // La consigne affiche « Administratif > Assurances » : reprendre la ligne
      // entière est une lecture fidèle, pas une confusion.
      expect(capturedPayload(suggestions)["existingFolderIds"]).toEqual([OTHER]);
    });

    it("écarte un identifiant que l'utilisateur ne possède pas", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const suggestions = makeSuggestionRepository();
      const folders = makeFolderRepository([makeFolder({ id: TAXES, name: "Impôts" })]);
      const llm = makeLlm(
        ["Je te range ça."],
        [filing([{ id: OTHER, name: "Impôts" }], [{ name: "Déclarations" }])],
      );

      await drain(makeService(makeRepository(), llm, suggestions, folders));

      const payload = capturedPayload(suggestions);
      // Le dossier neuf survit : perdre tout le rangement pour une ligne
      // fautive coûterait plus cher que de l'écarter.
      expect(payload["existingFolderIds"]).toEqual([]);
      expect(payload["newFolders"]).toEqual([{ name: "Déclarations" }]);
      jest.restoreAllMocks();
    });

    it("rattache un nouveau dossier vérifié à son parent existant", async () => {
      const suggestions = makeSuggestionRepository();
      const folders = makeFolderRepository([makeFolder({ id: TAXES, name: "Impôts" })]);
      const llm = makeLlm(
        ["Je te crée le sous-dossier."],
        [filing([], [{ name: "Déclarations", parent: { id: TAXES, name: "Impôts" } }])],
      );

      await drain(makeService(makeRepository(), llm, suggestions, folders));

      expect(capturedPayload(suggestions)["newFolders"]).toEqual([
        { name: "Déclarations", parentId: TAXES },
      ]);
    });

    it("pose le nouveau dossier à la racine quand son parent proposé est introuvable", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const suggestions = makeSuggestionRepository();
      const folders = makeFolderRepository([makeFolder({ id: TAXES, name: "Impôts" })]);
      const llm = makeLlm(
        ["Je te crée le dossier."],
        [filing([], [{ name: "Déclarations", parent: { id: OTHER, name: "Impôts" } }])],
      );

      await drain(makeService(makeRepository(), llm, suggestions, folders));

      // Le parent recopié de travers ne fait pas perdre le nouveau dossier :
      // il naît à la racine plutôt que de perdre toute la proposition.
      expect(capturedPayload(suggestions)["newFolders"]).toEqual([{ name: "Déclarations" }]);
      jest.restoreAllMocks();
    });

    it("demande de ne proposer que les dossiers dont la conversation traite", async () => {
      const llm = makeLlm();

      await drain(
        makeService(
          makeRepository(),
          llm,
          makeSuggestionRepository(),
          makeFolderRepository([makeFolder({ id: TAXES, name: "Impôts" })]),
        ),
      );

      const system = lastRequest(llm).system ?? "";
      expect(system).toContain("dont cette conversation-ci traite réellement");
      expect(system).toContain("dans le doute, laisse-le de côté");
    });
  });

  describe("contexte du canal permanent (A.10)", () => {
    /** Le canal, tel que la route le remet au service. */
    function channel(): IConversationRepository {
      return makeRepository({
        findById: jest
          .fn()
          .mockResolvedValue(
            makeConversation({ id: "canal", kind: "assistant", title: "Jean-Claude" }),
          ),
      });
    }

    it("remet au canal l'agenda des jours qui viennent", async () => {
      const llm = makeLlm();
      const calendar = makeCalendarRepository([
        makeEvent({ title: "Kiné", startsAt: "2026-09-03T16:00:00.000Z" }),
      ]);

      await drain(
        makeService(
          channel(),
          llm,
          makeSuggestionRepository(),
          makeFolderRepository(),
          makeUserRepository(),
          calendar,
        ),
      );

      // Le canal annonce les rappels comme premier de ses trois sujets : sans
      // cette lecture, « qu'est-ce que j'ai cette semaine ? » ne pouvait
      // produire qu'une invention.
      const system = lastRequest(llm).system ?? "";
      expect(system).toContain("Kiné");
      expect(system).toContain("jeudi 3 septembre 2026 à 18:00");
    });

    it("borne la fenêtre d'agenda à sept jours à partir du tour", async () => {
      const calendar = makeCalendarRepository();

      await drain(
        makeService(
          channel(),
          makeLlm(),
          makeSuggestionRepository(),
          makeFolderRepository(),
          makeUserRepository(),
          calendar,
        ),
      );

      expect(calendar.findInRange).toHaveBeenCalledWith(
        { from: "2026-09-02T12:30:00.000Z", to: "2026-09-09T12:30:00.000Z" },
        TOKEN,
      );
    });

    it("ne mentionne pas d'agenda quand rien n'est prévu", async () => {
      const llm = makeLlm();

      await drain(makeService(channel(), llm, makeSuggestionRepository(), makeFolderRepository()));

      // Une section vide pousserait le modèle à commenter un agenda dont
      // personne ne lui a parlé.
      expect(lastRequest(llm).system ?? "").not.toContain("Agenda des");
    });

    it("ne lit pas l'agenda pour une conversation classique", async () => {
      const llm = makeLlm();
      const calendar = makeCalendarRepository([makeEvent({ title: "Kiné" })]);

      await drain(
        makeService(
          makeRepository(),
          llm,
          makeSuggestionRepository(),
          makeFolderRepository(),
          makeUserRepository(),
          calendar,
        ),
      );

      expect(calendar.findInRange).not.toHaveBeenCalled();
      expect(lastRequest(llm).system ?? "").not.toContain("Kiné");
    });

    it("donne au canal les dossiers déjà créés, pour qu'il n'en propose pas d'homonyme", async () => {
      const llm = makeLlm();
      const folders = makeFolderRepository([makeFolder({ id: "folder-1", name: "Jardin" })]);

      await drain(makeService(channel(), llm, makeSuggestionRepository(), folders));

      // Sans cette liste, le canal annonçait « je te crée un dossier Jardin ? »
      // alors que Jardin existait : le service ne le dupliquait pas, mais la
      // phrase affichée à l'utilisateur était fausse (§12.1).
      const system = lastRequest(llm).system ?? "";
      expect(system).toContain("- Jardin (folder-1)");
      expect(system).toContain("Ne propose jamais de créer l'un");
    });

    it("ne relance pas une structure de dossiers tant que la précédente attend", async () => {
      const llm = makeLlm();
      const suggestions = makeSuggestionRepository({
        listForConversation: jest
          .fn()
          .mockResolvedValue([{ id: "sug-1", kind: "create_project_folders", status: "pending" }]),
      });

      await drain(makeService(channel(), llm, suggestions));

      expect(lastRequest(llm).tools?.map((t) => t.name)).not.toContain("suggest_project_folders");
    });
  });

  describe("propositions déjà tranchées (§12.1)", () => {
    it("rappelle au modèle ce qu'il a proposé et ce qu'il en est advenu", async () => {
      const llm = makeLlm();
      const suggestions = makeSuggestionRepository({
        listForConversation: jest.fn().mockResolvedValue([
          {
            id: "sug-1",
            kind: "assign_folders",
            status: "dismissed",
            message: "Je range ça dans Santé ?",
          },
        ]),
      });

      await drain(makeService(makeRepository(), llm, suggestions));

      // Sans cette trace, le modèle ne relit que sa propre prose et reformule
      // au tour suivant une proposition que l'utilisateur vient d'écarter.
      const system = lastRequest(llm).system ?? "";
      expect(system).toContain("Je range ça dans Santé ?");
      expect(system).toContain("écartée par l'utilisateur");
    });

    it("ne parle d'aucune proposition sur un fil qui n'en a pas reçu", async () => {
      const llm = makeLlm();

      await drain(makeService(makeRepository(), llm));

      expect(lastRequest(llm).system ?? "").not.toContain("Propositions que tu as déjà faites");
    });
  });

  describe("choix du modèle par l'utilisateur (§5.1)", () => {
    it("interroge le modèle retenu dans les réglages", async () => {
      const llm = makeLlm();
      const users = makeUserRepository(
        {},
        { preferences: makePreferences({ llmModel: "mistral/mistral-medium-3.5" }) },
      );

      await drain(makeService(makeRepository(), llm, undefined, undefined, users));

      expect(lastRequest(llm).model).toBe("mistral/mistral-medium-3.5");
    });

    it("laisse répondre le modèle du serveur tant que rien n'est choisi", async () => {
      const llm = makeLlm();

      await drain(makeService(makeRepository(), llm));

      // `undefined` et non `null` : l'adaptateur retombe alors sur `LLM_MODEL`,
      // ce qui permet d'en changer par configuration sans toucher aux profils.
      expect(lastRequest(llm).model).toBeUndefined();
    });

    it("laisse répondre le modèle du serveur quand le profil est introuvable", async () => {
      const llm = makeLlm();
      const users = makeUserRepository();
      (users.findById as jest.Mock).mockResolvedValue(null);

      await drain(makeService(makeRepository(), llm, undefined, undefined, users));

      expect(lastRequest(llm).model).toBeUndefined();
    });
  });

  describe("périmètre du mode assistant (A.10)", () => {
    it("retire du jeu l'outil dont la capacité est désactivée", async () => {
      const llm = makeLlm();

      await drain(
        makeService(
          makeRepository(),
          llm,
          makeSuggestionRepository(),
          makeFolderRepository(),
          makeUserRepository({ proactiveTaskDetection: false }),
        ),
        { content: "Il me faut du terreau et des bulbes.", inputMode: "text", attachmentIds: [] },
      );

      const tools = lastRequest(llm).tools?.map((t) => t.name) ?? [];
      expect(tools).not.toContain("suggest_task_list");
      // Les autres capacités restent actives : le réglage est par capacité,
      // pas un interrupteur général.
      expect(tools).toContain("suggest_recurring_event");
    });

    it("cesse de réclamer dans la consigne un outil qu'on ne remet plus", async () => {
      const llm = makeLlm();

      await drain(
        makeService(
          makeRepository({
            findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
          }),
          llm,
          makeSuggestionRepository(),
          makeFolderRepository(),
          makeUserRepository({ structureSuggestions: false }),
        ),
        { content: "Aide-moi à ranger mon espace.", inputMode: "text", attachmentIds: [] },
      );

      expect(lastRequest(llm).tools?.map((t) => t.name)).not.toContain("suggest_project_folders");
      expect(lastRequest(llm).system).not.toContain("suggest_project_folders");
    });

    it("n'offre plus de ranger un fil quand l'aide à l'organisation est coupée", async () => {
      const llm = makeLlm();
      const folders = makeFolderRepository([makeFolder({ id: "sante", name: "Santé" })]);

      await drain(
        makeService(
          makeRepository(),
          llm,
          makeSuggestionRepository(),
          folders,
          makeUserRepository({ folderOrganization: false }),
        ),
      );

      expect(lastRequest(llm).tools?.map((t) => t.name)).not.toContain("suggest_folders");
      // L'arborescence n'est pas non plus décrite au modèle : elle n'aurait
      // servi qu'à formuler la proposition qu'on vient de lui retirer.
      expect(lastRequest(llm).system).not.toContain("Santé");
    });

    it("laisse la bascule hors périmètre, qui n'est pas une capacité désactivable", async () => {
      const llm = makeLlm();

      await drain(
        makeService(
          makeRepository({
            findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
          }),
          llm,
          makeSuggestionRepository(),
          makeFolderRepository(),
          makeUserRepository({
            structureSuggestions: false,
            folderOrganization: false,
            morningReminders: false,
          }),
        ),
        { content: "Donne-moi une recette de tarte.", inputMode: "text", attachmentIds: [] },
      );

      // Sans elle, le canal répondrait lui-même hors de son périmètre : A.10
      // ne tiendrait plus. `ask_question` reste lui aussi : il ne fait que
      // donner une forme à une question, il n'ouvre aucune capacité.
      expect(lastRequest(llm).tools?.map((t) => t.name)).toEqual([
        "open_new_conversation",
        "ask_question",
      ]);
    });

    it("ignore l'appel d'un outil désactivé plutôt que d'en faire une proposition", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);

      const suggestions = makeSuggestionRepository();
      const llm = makeLlm(
        ["Je peux ranger ça."],
        [
          {
            id: "call-1",
            name: "suggest_folders",
            input: { message: "Je range ça dans Santé ?", newFolders: [{ name: "Santé" }] },
          },
        ],
      );

      await drain(
        makeService(
          makeRepository(),
          llm,
          suggestions,
          makeFolderRepository(),
          makeUserRepository({ folderOrganization: false }),
        ),
      );

      // Une capacité coupée n'est pas seulement masquée dans l'UI : aucune
      // suggestion correspondante n'est produite, même si le modèle nomme
      // malgré tout l'outil.
      expect(suggestions.create).not.toHaveBeenCalled();
    });

    it("retombe sur le périmètre par défaut quand le profil est illisible", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);

      const llm = makeLlm();

      await drain(
        makeService(makeRepository(), llm, makeSuggestionRepository(), makeFolderRepository(), {
          findById: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
          completeOnboarding: jest.fn(),
          deleteAccount: jest.fn(),
        }),
        { content: "Il me faut du terreau.", inputMode: "text", attachmentIds: [] },
      );

      // Un profil manquant ne doit pas priver l'utilisateur de son tour de
      // dialogue : on retient le périmètre d'un compte qui n'a jamais ouvert
      // ses réglages.
      expect(lastRequest(llm).tools?.map((t) => t.name)).toContain("suggest_task_list");
    });
  });

  describe("assignFolders", () => {
    it("remplace l'ensemble des rattachements plutôt que d'en ajouter un (§5.2, A.1)", async () => {
      const repo = makeRepository();

      await makeService(repo, makeLlm()).assignFolders(
        "conv-1",
        { folderIds: ["sante", "assurances"], source: "user" },
        TOKEN,
      );

      expect(repo.setFolders).toHaveBeenCalledWith(
        "conv-1",
        ["sante", "assurances"],
        "user",
        TOKEN,
      );
    });

    it("détache la conversation de tous ses dossiers quand la liste est vide", async () => {
      const repo = makeRepository();

      const result = await makeService(repo, makeLlm()).assignFolders(
        "conv-1",
        { folderIds: [], source: "user" },
        TOKEN,
      );

      expect(repo.setFolders).toHaveBeenCalledWith("conv-1", [], "user", TOKEN);
      expect(result.folderIds).toEqual([]);
    });

    it("signale une conversation introuvable plutôt que d'écrire un rangement dans le vide", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(null) });

      await expect(
        makeService(repo, makeLlm()).assignFolders(
          "absente",
          { folderIds: ["sante"], source: "user" },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.setFolders).not.toHaveBeenCalled();
    });
  });

  describe("extractTaskList (§13.4.1, #17)", () => {
    it("convertit l'historique du fil en todoliste, sans rien écrire dans la conversation", async () => {
      const repo = makeRepository();
      const created = makeSuggestion({
        kind: "create_task_list",
        payload: { lists: [{ title: "Courses", kind: "shopping", items: [{ title: "Terreau" }] }] },
      });
      const suggestions = makeSuggestionRepository({ create: jest.fn().mockResolvedValue(created) });
      const llm = makeLlm([], [
        {
          id: "call-1",
          name: "suggest_task_list",
          input: {
            message: "Je t'organise ça ?",
            lists: [{ title: "Courses", kind: "shopping", items: [{ title: "Terreau" }] }],
          },
        },
      ]);

      const suggestion = await makeService(repo, llm, suggestions).extractTaskList(
        "conv-1",
        USER,
        TOKEN,
      );

      expect(suggestion).toBe(created);
      expect(suggestions.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({ conversationId: "conv-1", kind: "create_task_list" }),
        TOKEN,
      );
      // Un appel dédié, hors du tour de dialogue ordinaire : rien n'est écrit
      // dans le fil, contrairement à un envoi de message classique.
      expect(repo.appendMessage).not.toHaveBeenCalled();
    });

    it("ramène aussi l'échéance à minuit local ici (A.3, #18)", async () => {
      const repo = makeRepository();
      const suggestions = makeSuggestionRepository();
      const llm = makeLlm([], [
        {
          id: "call-1",
          name: "suggest_task_list",
          input: {
            message: "Je t'organise ça ?",
            lists: [
              {
                title: "Courses",
                kind: "shopping",
                // Convention de « fin de journée » qu'un LLM produit souvent :
                // sans ce même filet qu'au fil du dialogue ordinaire, cette
                // échéance extraite ici y échapperait.
                dueAt: "2026-09-10T23:59:00.000+02:00",
                items: [{ title: "Terreau" }],
              },
            ],
          },
        },
      ]);

      await makeService(repo, llm, suggestions).extractTaskList("conv-1", USER, TOKEN);

      expect(suggestions.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({
          payload: expect.objectContaining({
            lists: [expect.objectContaining({ dueAt: "2026-09-09T22:00:00.000Z" })],
          }),
        }),
        TOKEN,
      );
    });

    it("regroupe plusieurs appels suggest_task_list séparés en une seule proposition", async () => {
      const repo = makeRepository();
      const suggestions = makeSuggestionRepository();
      const llm = makeLlm(
        [],
        [
          {
            id: "call-1",
            name: "suggest_task_list",
            input: {
              message: "Je t'organise les achats ?",
              lists: [{ title: "Achats jardin", kind: "shopping", items: [{ title: "Terreau" }] }],
            },
          },
          {
            id: "call-2",
            name: "suggest_task_list",
            input: {
              message: "Et les travaux ?",
              lists: [{ title: "Travaux jardin", kind: "todo", items: [{ title: "Désherber" }] }],
            },
          },
        ],
      );

      await makeService(repo, llm, suggestions).extractTaskList("conv-1", USER, TOKEN);

      // Sans le regroupement, seul le premier appel (`toolCalls.find`) survivait :
      // la liste de travaux disparaissait silencieusement — le symptôme rapporté
      // (« l'IA ne propose que le 1er choix »).
      expect(suggestions.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({
          payload: expect.objectContaining({
            lists: [
              expect.objectContaining({ title: "Achats jardin" }),
              expect.objectContaining({ title: "Travaux jardin" }),
            ],
          }),
        }),
        TOKEN,
      );
    });

    it("ne propose que l'outil de conversion au modèle, pas le jeu habituel", async () => {
      const llm = makeLlm();

      await expect(
        makeService(makeRepository(), llm).extractTaskList("conv-1", USER, TOKEN),
      ).rejects.toMatchObject({ status: 422 });

      // Sans appel exploitable, il n'y a rien à capturer : le geste explicite
      // n'a pas plus de garantie qu'une proposition spontanée.
      expect(lastRequest(llm).tools?.map((t) => t.name)).toEqual(["suggest_task_list"]);
    });

    it("refuse de convertir le canal permanent", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
      });

      await expect(
        makeService(repo).extractTaskList("conv-1", USER, TOKEN),
      ).rejects.toMatchObject({ status: 422 });
    });

    it("refuse quand la détection de todolistes est désactivée dans les réglages (A.10)", async () => {
      const users = makeUserRepository({ proactiveTaskDetection: false });

      await expect(
        makeService(
          makeRepository(),
          makeLlm(),
          makeSuggestionRepository(),
          makeFolderRepository(),
          users,
        ).extractTaskList("conv-1", USER, TOKEN),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("refuse une conversation sans historique exploitable", async () => {
      const repo = makeRepository({ listMessages: emptyThread() });

      await expect(
        makeService(repo).extractTaskList("conv-1", USER, TOKEN),
      ).rejects.toMatchObject({ status: 422 });
    });
  });

  describe("correction des échéances relatives (A.3, #18)", () => {
    it("remplace l'échéance du modèle par le calcul déterministe quand l'expression est reconnue", async () => {
      const suggestions = makeSuggestionRepository();
      const llm = makeLlm(
        [],
        [
          {
            id: "call-1",
            name: "suggest_task_list",
            input: {
              message: "Je t'organise ça ?",
              lists: [
                {
                  title: "Courses",
                  kind: "shopping",
                  // Date fautive du modèle : le serveur doit la corriger.
                  // NOW est un mercredi (2 septembre) : le prochain vendredi
                  // est le 4, minuit Paris.
                  dueAt: "2026-09-01T00:00:00.000Z",
                  dueAtText: "vendredi",
                  items: [{ title: "Pain" }],
                },
              ],
            },
          },
        ],
      );

      await drain(makeService(makeRepository(), llm, suggestions), {
        content: "Il me faut du pain pour vendredi.",
        inputMode: "text",
        attachmentIds: [],
      });

      expect(suggestions.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({
          payload: expect.objectContaining({
            lists: [expect.objectContaining({ title: "Courses", dueAt: "2026-09-03T22:00:00.000Z" })],
          }),
        }),
        TOKEN,
      );
    });

    it("conserve l'heure donnée explicitement même quand le jour vient du filet déterministe", async () => {
      const suggestions = makeSuggestionRepository();
      const llm = makeLlm(
        [],
        [
          {
            id: "call-1",
            name: "suggest_task_list",
            input: {
              message: "Je t'organise ça ?",
              lists: [
                {
                  title: "Courses",
                  kind: "shopping",
                  dueAt: "2026-09-05T08:00:00.000Z",
                  dueAtText: "samedi",
                  dueTime: "10:00",
                  items: [{ title: "Œufs" }],
                },
              ],
            },
          },
        ],
      );

      await drain(makeService(makeRepository(), llm, suggestions), {
        content: "Crée une liste de courses pour samedi à 10h.",
        inputMode: "text",
        attachmentIds: [],
      });

      // Le jour vient du filet (le prochain samedi, 5 septembre), mais
      // `dueTime` porte l'heure donnée explicitement : elle n'est plus
      // perdue au passage du filet, contrairement à avant ce champ (#18).
      expect(suggestions.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({
          payload: expect.objectContaining({
            lists: [expect.objectContaining({ title: "Courses", dueAt: "2026-09-05T08:00:00.000Z" })],
          }),
        }),
        TOKEN,
      );
    });

    it("ignore l'heure du calcul du modèle en l'absence de dueTime, même non nulle", async () => {
      const suggestions = makeSuggestionRepository();
      const llm = makeLlm(
        [],
        [
          {
            id: "call-1",
            name: "suggest_task_list",
            input: {
              message: "Je t'organise ça ?",
              lists: [
                {
                  title: "Courses",
                  kind: "shopping",
                  // Le modèle s'est trompé de fuseau (2h du matin à Paris,
                  // ni minuit ni une heure demandée) sans qu'aucune heure
                  // n'ait été donnée : sans `dueTime`, ce n'est pas une heure
                  // à retenir — la déduire de `dueAt` créerait un faux
                  // rendez-vous là où l'utilisateur n'en a jamais demandé.
                  dueAt: "2026-09-05T00:00:00.000Z",
                  dueAtText: "samedi",
                  items: [{ title: "Œufs" }],
                },
              ],
            },
          },
        ],
      );

      await drain(makeService(makeRepository(), llm, suggestions), {
        content: "Crée une liste de courses pour samedi.",
        inputMode: "text",
        attachmentIds: [],
      });

      expect(suggestions.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({
          payload: expect.objectContaining({
            lists: [expect.objectContaining({ dueAt: "2026-09-04T22:00:00.000Z" })],
          }),
        }),
        TOKEN,
      );
    });

    it("ignore une heure au format invalide plutôt que d'échouer", async () => {
      const suggestions = makeSuggestionRepository();
      const llm = makeLlm(
        [],
        [
          {
            id: "call-1",
            name: "suggest_task_list",
            input: {
              message: "Je t'organise ça ?",
              lists: [
                {
                  title: "Courses",
                  kind: "shopping",
                  dueAt: "2026-09-05T08:00:00.000Z",
                  dueAtText: "samedi",
                  // Hallucination de format : ni « HH:mm » ni exploitable.
                  dueTime: "10h",
                  items: [{ title: "Œufs" }],
                },
              ],
            },
          },
        ],
      );

      await drain(makeService(makeRepository(), llm, suggestions), {
        content: "Crée une liste de courses pour samedi.",
        inputMode: "text",
        attachmentIds: [],
      });

      expect(suggestions.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({
          payload: expect.objectContaining({
            lists: [expect.objectContaining({ dueAt: "2026-09-04T22:00:00.000Z" })],
          }),
        }),
        TOKEN,
      );
    });

    it("ramène l'échéance du modèle à minuit local quand l'expression n'est pas reconnue", async () => {
      const suggestions = makeSuggestionRepository();
      const llm = makeLlm(
        [],
        [
          {
            id: "call-1",
            name: "suggest_task_list",
            input: {
              message: "Je t'organise ça ?",
              lists: [
                {
                  title: "Courses",
                  kind: "shopping",
                  // Minuit UTC, mais « le 15 septembre » n'est pas reconnu par
                  // le filet déterministe : le calcul du modèle reste la base,
                  // mais son heure est tout de même ramenée à minuit à Paris —
                  // une todoliste ne porte jamais d'horaire (A.3, #18).
                  dueAt: "2026-09-15T00:00:00.000Z",
                  dueAtText: "le 15 septembre",
                  items: [{ title: "Pain" }],
                },
              ],
            },
          },
        ],
      );

      await drain(makeService(makeRepository(), llm, suggestions), {
        content: "Il me faut du pain pour le 15.",
        inputMode: "text",
        attachmentIds: [],
      });

      // Minuit à Paris le 15 septembre, encore à l'heure d'été (UTC+2).
      expect(suggestions.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({
          payload: expect.objectContaining({
            lists: [expect.objectContaining({ dueAt: "2026-09-14T22:00:00.000Z" })],
          }),
        }),
        TOKEN,
      );
    });

    it("ramène l'échéance du modèle à minuit local quand la liste ne porte pas d'expression source", async () => {
      const suggestions = makeSuggestionRepository();
      const llm = makeLlm(
        [],
        [
          {
            id: "call-1",
            name: "suggest_task_list",
            input: {
              message: "Je t'organise ça ?",
              lists: [
                {
                  title: "Courses",
                  kind: "shopping",
                  dueAt: "2026-09-10T00:00:00.000Z",
                  items: [{ title: "Pain" }],
                },
              ],
            },
          },
        ],
      );

      await drain(makeService(makeRepository(), llm, suggestions), {
        content: "Il me faut du pain.",
        inputMode: "text",
        attachmentIds: [],
      });

      expect(suggestions.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({
          payload: expect.objectContaining({
            lists: [expect.objectContaining({ dueAt: "2026-09-09T22:00:00.000Z" })],
          }),
        }),
        TOKEN,
      );
    });

    it("corrige une échéance que le modèle a calée en fin de journée plutôt qu'à minuit", async () => {
      const suggestions = makeSuggestionRepository();
      const llm = makeLlm(
        [],
        [
          {
            id: "call-1",
            name: "suggest_task_list",
            input: {
              message: "Je t'organise ça ?",
              lists: [
                {
                  title: "Courses",
                  kind: "shopping",
                  // Un LLM laissé libre retombe souvent sur cette convention de
                  // « fin de journée » plutôt que sur minuit : sans correction,
                  // un `schedule_task` accepté poserait un rendez-vous à 23h59
                  // au lieu d'un créneau journée entière.
                  dueAt: "2026-09-10T23:59:00.000+02:00",
                  items: [{ title: "Pain" }],
                },
              ],
            },
          },
        ],
      );

      await drain(makeService(makeRepository(), llm, suggestions), {
        content: "Il me faut du pain pour vendredi soir.",
        inputMode: "text",
        attachmentIds: [],
      });

      expect(suggestions.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({
          payload: expect.objectContaining({
            lists: [expect.objectContaining({ dueAt: "2026-09-09T22:00:00.000Z" })],
          }),
        }),
        TOKEN,
      );
    });

    it("efface l'échéance d'une todoliste que le modèle propose dans le passé", async () => {
      const suggestions = makeSuggestionRepository();
      const llm = makeLlm(
        [],
        [
          {
            id: "call-1",
            name: "suggest_task_list",
            input: {
              message: "Je t'organise ça ?",
              lists: [
                {
                  title: "Courses",
                  kind: "shopping",
                  // NOW est le 2 septembre : une échéance calée la veille ne
                  // doit jamais atteindre la carte proposée (§12.1).
                  dueAt: "2026-09-01T00:00:00.000Z",
                  items: [{ title: "Pain" }],
                },
              ],
            },
          },
        ],
      );

      await drain(makeService(makeRepository(), llm, suggestions), {
        content: "Il me fallait du pain hier.",
        inputMode: "text",
        attachmentIds: [],
      });

      expect(suggestions.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({
          payload: expect.objectContaining({
            lists: [expect.objectContaining({ dueAt: null })],
          }),
        }),
        TOKEN,
      );
    });
  });

  describe("reprogrammation d'une todoliste existante (§12.1, A.2)", () => {
    const EXISTING_LIST = makeTaskList({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Travaux jardin",
      kind: "todo",
      dueAt: "2026-09-05T00:00:00.000Z",
      conversationId: "conv-1",
    });

    it("expose l'outil de reprogrammation dès qu'une liste est née de ce fil", async () => {
      const llm = makeLlm();
      const tasks = makeTaskRepository([EXISTING_LIST]);

      await drain(
        makeService(
          makeRepository(),
          llm,
          makeSuggestionRepository(),
          makeFolderRepository(),
          makeUserRepository(),
          makeCalendarRepository(),
          tasks,
        ),
      );

      expect(lastRequest(llm).tools?.map((t) => t.name)).toContain("suggest_task_list_due_date");
      expect(lastRequest(llm).system ?? "").toContain("échéance 2026-09-05T00:00:00.000Z");
    });

    it("ne propose pas de reprogrammer quand le fil n'a encore aucune liste", async () => {
      const llm = makeLlm();

      await drain(makeService(makeRepository(), llm));

      expect(lastRequest(llm).tools?.map((t) => t.name)).not.toContain(
        "suggest_task_list_due_date",
      );
    });

    it("capture une reprogrammation vers une date résolue par le filet déterministe", async () => {
      const suggestions = makeSuggestionRepository();
      const tasks = makeTaskRepository([EXISTING_LIST]);
      const llm = makeLlm(
        [],
        [
          {
            id: "call-1",
            name: "suggest_task_list_due_date",
            input: {
              message: "Je décale Travaux jardin à vendredi ?",
              listId: EXISTING_LIST.id,
              // Date fautive du modèle, comme pour la création : le calcul
              // déterministe du serveur la remplace.
              dueAt: "2026-09-01T00:00:00.000Z",
              dueAtText: "vendredi",
            },
          },
        ],
      );

      await drain(
        makeService(
          makeRepository(),
          llm,
          suggestions,
          makeFolderRepository(),
          makeUserRepository(),
          makeCalendarRepository(),
          tasks,
        ),
        { content: "Décale les travaux du jardin à vendredi.", inputMode: "text", attachmentIds: [] },
      );

      // Vendredi 4 septembre, minuit à Paris.
      expect(suggestions.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({
          kind: "update_task_list_due_date",
          payload: { listId: EXISTING_LIST.id, dueAt: "2026-09-03T22:00:00.000Z" },
        }),
        TOKEN,
      );
    });

    it("conserve l'heure donnée explicitement lors d'une reprogrammation", async () => {
      const suggestions = makeSuggestionRepository();
      const tasks = makeTaskRepository([EXISTING_LIST]);
      const llm = makeLlm(
        [],
        [
          {
            id: "call-1",
            name: "suggest_task_list_due_date",
            input: {
              message: "Je décale Travaux jardin à vendredi 14h ?",
              listId: EXISTING_LIST.id,
              dueAt: "2026-09-04T12:00:00.000Z",
              dueAtText: "vendredi",
              dueTime: "14:00",
            },
          },
        ],
      );

      await drain(
        makeService(
          makeRepository(),
          llm,
          suggestions,
          makeFolderRepository(),
          makeUserRepository(),
          makeCalendarRepository(),
          tasks,
        ),
        {
          content: "Décale les travaux du jardin à vendredi 14h.",
          inputMode: "text",
          attachmentIds: [],
        },
      );

      // Vendredi 4 septembre, 14h à Paris (UTC+2).
      expect(suggestions.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({
          kind: "update_task_list_due_date",
          payload: { listId: EXISTING_LIST.id, dueAt: "2026-09-04T12:00:00.000Z" },
        }),
        TOKEN,
      );
    });

    it("abandonne une reprogrammation dont la nouvelle échéance retombe dans le passé", async () => {
      const suggestions = makeSuggestionRepository();
      const tasks = makeTaskRepository([EXISTING_LIST]);
      const llm = makeLlm(
        [],
        [
          {
            id: "call-1",
            name: "suggest_task_list_due_date",
            input: {
              message: "Je décale Travaux jardin ?",
              listId: EXISTING_LIST.id,
              dueAt: "2026-09-01T00:00:00.000Z",
            },
          },
        ],
      );

      await drain(
        makeService(
          makeRepository(),
          llm,
          suggestions,
          makeFolderRepository(),
          makeUserRepository(),
          makeCalendarRepository(),
          tasks,
        ),
        { content: "Décale les travaux du jardin au 1er.", inputMode: "text", attachmentIds: [] },
      );

      expect(suggestions.create).not.toHaveBeenCalled();
    });
  });
});
