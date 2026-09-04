import type {
  Conversation,
  CreateCalendarEvent,
  CreateTask,
  CreateTaskList,
  Folder,
  Suggestion,
  Task,
  TaskListWithTasks,
} from "@jc/domain";
import type { LlmProvider } from "../../core/llm/llm.port.js";
import type { ICalendarRepository } from "../../domain/calendar/calendar.repository.interface.js";
import { CalendarService } from "../../domain/calendar/calendar.service.js";
import type { IConversationRepository } from "../../domain/conversation/conversation.repository.interface.js";
import { ConversationService } from "../../domain/conversation/conversation.service.js";
import type { IFolderRepository } from "../../domain/folder/folder.repository.interface.js";
import { FolderService } from "../../domain/folder/folder.service.js";
import type {
  CreateSuggestion,
  ISuggestionRepository,
} from "../../domain/suggestion/suggestion.repository.interface.js";
import { SuggestionService } from "../../domain/suggestion/suggestion.service.js";
import type {
  ITaskRepository,
  TaskListOrigin,
  TaskListPatch,
  TaskPatch,
} from "../../domain/task/task.repository.interface.js";
import { TaskService } from "../../domain/task/task.service.js";
import type { IUserRepository } from "../../domain/user/user.repository.interface.js";
import { AssistantService } from "./assistant.service.js";

const TOKEN = "access-token";
const USER = "user-1";
const NOW = "2026-09-01T08:00:00.000Z";
const DESHERBAGE = "2026-09-07T09:00:00.000Z";

/**
 * Identifiants fabriqués au format UUID : la charge utile des créneaux les
 * valide comme tels, et un `list-1` la ferait échouer pour une raison qui
 * n'existe pas en vrai.
 */
function uuid(sequence: number): string {
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

/** Les identifiants de dossier voyagent dans la charge utile, validés en UUID. */
const SANTE = "a1b2c3d4-0001-4000-8000-000000000001";
const ASSURANCES = "a1b2c3d4-0002-4000-8000-000000000002";
const INVENTE = "a1b2c3d4-0003-4000-8000-000000000003";

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

function makeSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: "sug-1",
    kind: "create_project_folders",
    status: "pending",
    conversationId: "conv-1",
    message: "Je te crée un dossier Jardin ?",
    payload: {
      folders: [
        {
          name: "Jardin",
          purpose: "generic",
          children: [
            { name: "ACHAT", purpose: "purchase" },
            { name: "TODO", purpose: "todo" },
          ],
        },
      ],
    },
    createdAt: "2026-09-01T08:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

function makeSuggestionRepository(
  overrides: Partial<ISuggestionRepository> = {},
): ISuggestionRepository {
  return {
    create: jest.fn().mockResolvedValue(makeSuggestion()),
    findById: jest.fn().mockResolvedValue(makeSuggestion()),
    listPending: jest.fn().mockResolvedValue([]),
    listForConversation: jest.fn().mockResolvedValue([]),
    markResolved: jest
      .fn()
      .mockImplementation((id: string, status: Suggestion["status"]) =>
        Promise.resolve(makeSuggestion({ id, status })),
      ),
    ...overrides,
  };
}

/**
 * Double avec état : `FolderService.create` relit le dossier parent avant
 * d'accepter un sous-dossier. Un double sans mémoire ferait échouer la
 * création du deuxième niveau pour une raison qui n'existe pas en vrai.
 */
function makeFolderRepository(initial: Folder[] = []): IFolderRepository {
  const store = new Map(initial.map((folder) => [folder.id, folder]));

  return {
    findAll: jest.fn().mockImplementation(() => Promise.resolve([...store.values()])),
    findById: jest.fn().mockImplementation((id: string) => Promise.resolve(store.get(id) ?? null)),
    create: jest
      .fn()
      .mockImplementation(
        (
          _userId: string,
          input: { name: string; parentId?: string | null; purpose?: Folder["purpose"] },
        ) => {
          const folder = makeFolder({
            id: `folder-${input.name}`,
            name: input.name,
            parentId: input.parentId ?? null,
            purpose: input.purpose ?? "generic",
          });
          store.set(folder.id, folder);
          return Promise.resolve(folder);
        },
      ),
    update: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
    countConversations: jest.fn().mockResolvedValue(new Map<string, number>()),
  };
}

function makeConversation(folderIds: string[] = []): Conversation {
  return {
    id: "conv-1",
    kind: "chat",
    title: "Mutuelle santé",
    folderIds,
    archivedAt: null,
    lastMessageAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeConversationRepository(
  overrides: Partial<IConversationRepository> = {},
): IConversationRepository {
  const conversation = makeConversation();

  return {
    findAll: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    findById: jest.fn().mockResolvedValue(conversation),
    findAssistantChannel: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(conversation),
    update: jest.fn().mockResolvedValue(conversation),
    delete: jest.fn().mockResolvedValue(undefined),
    setFolders: jest.fn().mockResolvedValue([]),
    listMessages: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    appendMessage: jest.fn(),
    findMessage: jest.fn().mockResolvedValue(null),
    updateMessageContent: jest.fn(),
    deleteMessage: jest.fn().mockResolvedValue(undefined),
    deleteMessagesAfter: jest.fn().mockResolvedValue(undefined),
    acceptRedirect: jest.fn(),
    ...overrides,
  };
}

/** Le tour de dialogue n'est jamais joué ici : seul `assignFolders` est appelé. */
const IDLE_LLM: LlmProvider = {
  name: "gateway",
  model: "anthropic/claude-sonnet-5",
  isSovereign: false,
  stream: jest.fn(),
};

/** Même raison : le périmètre ne se lit qu'au moment d'appeler le moteur. */
const IDLE_USERS: IUserRepository = {
  findById: jest.fn(),
  update: jest.fn(),
  completeOnboarding: jest.fn(),
};

/**
 * Double avec état : `TaskService` relit la liste avant d'y ajouter une tâche,
 * pour en déduire sa position, et relit la tâche avant de lui rattacher un
 * créneau. Un double sans mémoire échouerait aux deux.
 */
function makeTaskRepository(): ITaskRepository {
  const lists = new Map<string, TaskListWithTasks>();
  let sequence = 0;

  return {
    findAll: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ items: [...lists.values()], nextCursor: null })),
    findById: jest.fn().mockImplementation((id: string) => Promise.resolve(lists.get(id) ?? null)),
    findByConversation: jest
      .fn()
      .mockImplementation((conversationId: string) =>
        Promise.resolve(
          [...lists.values()].filter((list) => list.conversationId === conversationId),
        ),
      ),
    createList: jest
      .fn()
      .mockImplementation((_userId: string, input: CreateTaskList & TaskListOrigin) => {
        sequence += 1;
        const list: TaskListWithTasks = {
          id: uuid(sequence),
          title: input.title,
          kind: input.kind,
          dueAt: input.dueAt ?? null,
          eventId: null,
          conversationId: input.conversationId ?? null,
          folderId: input.folderId ?? null,
          createdByAssistant: input.createdByAssistant ?? false,
          createdAt: NOW,
          updatedAt: NOW,
          tasks: [],
        };
        lists.set(list.id, list);
        return Promise.resolve(list);
      }),
    updateList: jest.fn().mockImplementation((id: string, patch: TaskListPatch) => {
      const list = lists.get(id);
      if (!list) return Promise.reject(new Error("Liste introuvable"));
      if (patch.eventId !== undefined) list.eventId = patch.eventId;
      return Promise.resolve(list);
    }),
    deleteList: jest.fn(),
    createTask: jest
      .fn()
      .mockImplementation(
        (_userId: string, listId: string, input: CreateTask, position: number) => {
          sequence += 1;
          const task: Task = {
            id: uuid(sequence),
            listId,
            title: input.title,
            notes: input.notes ?? null,
            done: false,
            completedAt: null,
            parentId: input.parentId ?? null,
            position,
            createdAt: NOW,
            updatedAt: NOW,
          };
          lists.get(listId)?.tasks.push(task);
          return Promise.resolve(task);
        },
      ),
    updateTask: jest.fn().mockImplementation((listId: string, taskId: string, patch: TaskPatch) => {
      const task = lists.get(listId)?.tasks.find((candidate) => candidate.id === taskId);
      if (!task) return Promise.reject(new Error("Tâche introuvable"));
      if (patch.title !== undefined) task.title = patch.title;
      return Promise.resolve(task);
    }),
    deleteTask: jest.fn(),
    replaceTasks: jest.fn(),
  };
}

function makeCalendarRepository(): ICalendarRepository {
  let sequence = 0;

  return {
    findInRange: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((_userId: string, input: CreateCalendarEvent) => {
      sequence += 1;
      return Promise.resolve({
        id: `event-${sequence}`,
        title: input.title,
        notes: null,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        allDay: input.allDay,
        rrule: null,
        reminderMinutesBefore: null,
        folderId: null,
        conversationId: null,
        createdByAssistant: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
    }),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function makeService(
  suggestions: ISuggestionRepository = makeSuggestionRepository(),
  folders: IFolderRepository = makeFolderRepository(),
  conversations: IConversationRepository = makeConversationRepository(),
  tasks: ITaskRepository = makeTaskRepository(),
  events: ICalendarRepository = makeCalendarRepository(),
): AssistantService {
  const suggestionService = new SuggestionService(suggestions);
  const folderService = new FolderService(folders);
  const calendarService = new CalendarService(events);
  const taskService = new TaskService(tasks);

  return new AssistantService(
    suggestionService,
    folderService,
    new ConversationService(
      conversations,
      IDLE_LLM,
      suggestionService,
      folderService,
      IDLE_USERS,
      calendarService,
      taskService,
    ),
    taskService,
    calendarService,
  );
}

/**
 * Double avec état : la proposition de créneaux naît de l'acceptation des
 * todolistes, et doit être relisible pour être acceptée à son tour.
 */
function makeSuggestionStore(initial: Suggestion): ISuggestionRepository {
  const store = new Map<string, Suggestion>([[initial.id, initial]]);
  let sequence = 0;

  return {
    create: jest.fn().mockImplementation((_userId: string, input: CreateSuggestion) => {
      sequence += 1;
      const suggestion = makeSuggestion({ id: `sug-suite-${sequence}`, ...input });
      store.set(suggestion.id, suggestion);
      return Promise.resolve(suggestion);
    }),
    findById: jest.fn().mockImplementation((id: string) => Promise.resolve(store.get(id) ?? null)),
    listPending: jest.fn().mockResolvedValue([]),
    listForConversation: jest.fn().mockResolvedValue([]),
    markResolved: jest.fn().mockImplementation((id: string, status: Suggestion["status"]) => {
      const resolved = { ...(store.get(id) ?? makeSuggestion()), id, status };
      store.set(id, resolved);
      return Promise.resolve(resolved);
    }),
  };
}

/** Les deux listes du jardin : les achats d'un côté, le travail à faire de l'autre. */
function makeJardinSuggestion(): Suggestion {
  return makeSuggestion({
    kind: "create_task_list",
    message: "Je te les organise ?",
    payload: {
      lists: [
        {
          title: "Achats jardin",
          kind: "shopping",
          items: [{ title: "Terreau" }],
        },
        {
          title: "Travaux jardin",
          kind: "todo",
          dueAt: DESHERBAGE,
          items: [{ title: "Désherber" }, { title: "Tondre" }],
        },
      ],
    },
  });
}

/** Listes créées, dans l'ordre, avec ce que le serveur y a posé. */
function createdLists(repo: ITaskRepository): (CreateTaskList & TaskListOrigin)[] {
  return (repo.createList as jest.Mock).mock.calls.map(
    (call) => call[1] as CreateTaskList & TaskListOrigin,
  );
}

function makeFilingSuggestion(payload: Record<string, unknown>): Suggestion {
  return makeSuggestion({ kind: "assign_folders", message: "Je range ça ?", payload });
}

/** Dossiers finalement rattachés à la conversation, dans l'ordre d'appel. */
function assignedFolders(repo: IConversationRepository): string[] {
  const call = (repo.setFolders as jest.Mock).mock.calls[0] as [string, string[], string, string];
  return call[1];
}

/** Noms des dossiers créés, dans l'ordre, avec leur parent. */
function createdFolders(repo: IFolderRepository): { name: string; parentId: string | null }[] {
  return (repo.create as jest.Mock).mock.calls.map((call) => {
    const input = call[1] as { name: string; parentId: string | null };
    return { name: input.name, parentId: input.parentId };
  });
}

describe("AssistantService", () => {
  describe("acceptation d'une proposition", () => {
    it("crée le dossier racine puis ses sous-dossiers", async () => {
      const folders = makeFolderRepository();

      await makeService(makeSuggestionRepository(), folders).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      expect(createdFolders(folders)).toEqual([
        { name: "Jardin", parentId: null },
        { name: "ACHAT", parentId: "folder-Jardin" },
        { name: "TODO", parentId: "folder-Jardin" },
      ]);
    });

    it("marque les dossiers créés comme venant de l'assistant", async () => {
      const folders = makeFolderRepository();

      await makeService(makeSuggestionRepository(), folders).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      for (const call of (folders.create as jest.Mock).mock.calls) {
        expect(call[1]).toMatchObject({ createdByAssistant: true });
      }
    });

    it("passe la proposition en acceptée", async () => {
      const suggestions = makeSuggestionRepository();

      const resolved = await makeService(suggestions).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      expect(suggestions.markResolved).toHaveBeenCalledWith("sug-1", "accepted", TOKEN);
      expect(resolved.suggestion.status).toBe("accepted");
    });

    it("ne recrée pas un dossier déjà présent, et complète ce qui manque", async () => {
      const folders = makeFolderRepository([
        makeFolder({ id: "existing-jardin", name: "jardin" }),
        makeFolder({ id: "existing-achat", name: "ACHAT", parentId: "existing-jardin" }),
      ]);

      const resolved = await makeService(makeSuggestionRepository(), folders).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      // « jardin » et « ACHAT » existent déjà : seul « TODO » est à créer, sous
      // le dossier retrouvé.
      expect(createdFolders(folders)).toEqual([{ name: "TODO", parentId: "existing-jardin" }]);
      expect(resolved.folders.map((folder) => folder.name)).toEqual(["TODO"]);
    });

    it("refuse une proposition dont la charge utile n'est plus lisible", async () => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      const folders = makeFolderRepository();
      const suggestions = makeSuggestionRepository({
        findById: jest.fn().mockResolvedValue(makeSuggestion({ payload: { folders: [] } })),
      });

      await expect(
        makeService(suggestions, folders).resolve(USER, "sug-1", { action: "accept" }, TOKEN),
      ).rejects.toMatchObject({ status: 422 });

      expect(folders.create).not.toHaveBeenCalled();
      expect(suggestions.markResolved).not.toHaveBeenCalled();
      jest.restoreAllMocks();
    });
  });

  describe("rangement d'une conversation (A.1)", () => {
    it("rattache la conversation aux dossiers existants proposés", async () => {
      const suggestions = makeSuggestionRepository({
        findById: jest
          .fn()
          .mockResolvedValue(
            makeFilingSuggestion({ existingFolderIds: [SANTE, ASSURANCES], newFolderNames: [] }),
          ),
      });
      const folders = makeFolderRepository([
        makeFolder({ id: SANTE, name: "Santé" }),
        makeFolder({ id: ASSURANCES, name: "Assurances" }),
      ]);
      const conversations = makeConversationRepository();

      await makeService(suggestions, folders, conversations).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      // Plusieurs dossiers d'un coup : une conversation n'a pas de parent
      // unique (§5.2, A.1).
      expect(assignedFolders(conversations)).toEqual([SANTE, ASSURANCES]);
      expect(folders.create).not.toHaveBeenCalled();
    });

    it("crée le dossier proposé quand aucun existant ne convient", async () => {
      const suggestions = makeSuggestionRepository({
        findById: jest
          .fn()
          .mockResolvedValue(
            makeFilingSuggestion({ existingFolderIds: [], newFolderNames: ["Assurances"] }),
          ),
      });
      const folders = makeFolderRepository();
      const conversations = makeConversationRepository();

      const resolved = await makeService(suggestions, folders, conversations).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      expect(folders.create).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({ name: "Assurances", createdByAssistant: true }),
        TOKEN,
      );
      expect(assignedFolders(conversations)).toEqual(["folder-Assurances"]);
      expect(resolved.folders.map((folder) => folder.name)).toEqual(["Assurances"]);
    });

    it("réutilise un dossier homonyme au lieu d'en créer un doublon", async () => {
      const suggestions = makeSuggestionRepository({
        findById: jest
          .fn()
          .mockResolvedValue(
            makeFilingSuggestion({ existingFolderIds: [], newFolderNames: ["assurances"] }),
          ),
      });
      const folders = makeFolderRepository([makeFolder({ id: ASSURANCES, name: "Assurances" })]);
      const conversations = makeConversationRepository();

      await makeService(suggestions, folders, conversations).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      expect(folders.create).not.toHaveBeenCalled();
      expect(assignedFolders(conversations)).toEqual([ASSURANCES]);
    });

    it("accepte un dossier situé profond dans l'arborescence", async () => {
      const suggestions = makeSuggestionRepository({
        findById: jest
          .fn()
          .mockResolvedValue(
            makeFilingSuggestion({ existingFolderIds: [ASSURANCES], newFolderNames: [] }),
          ),
      });
      const intermediaire = "a1b2c3d4-0004-4000-8000-000000000004";
      const folders = makeFolderRepository([
        makeFolder({ id: SANTE, name: "Santé" }),
        makeFolder({ id: intermediaire, name: "Contrats", parentId: SANTE }),
        // Troisième niveau : hors de portée d'un aplatissement à deux niveaux.
        makeFolder({ id: ASSURANCES, name: "Assurances", parentId: intermediaire }),
      ]);
      const conversations = makeConversationRepository();

      await makeService(suggestions, folders, conversations).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      // Un dossier oublié par l'aplatissement passerait pour un identifiant
      // inventé et serait écarté du rangement.
      expect(assignedFolders(conversations)).toEqual([ASSURANCES]);
    });

    it("écarte un identifiant de dossier que le modèle a inventé", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const suggestions = makeSuggestionRepository({
        findById: jest.fn().mockResolvedValue(
          makeFilingSuggestion({
            existingFolderIds: [SANTE, INVENTE],
            newFolderNames: [],
          }),
        ),
      });
      const folders = makeFolderRepository([makeFolder({ id: SANTE, name: "Santé" })]);
      const conversations = makeConversationRepository();

      await makeService(suggestions, folders, conversations).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      // L'identifiant inventé échouerait sur la clé étrangère et emporterait
      // tout le rangement avec lui.
      expect(assignedFolders(conversations)).toEqual([SANTE]);
      jest.restoreAllMocks();
    });

    it("refuse un rangement dont plus aucun dossier n'est applicable", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      const suggestions = makeSuggestionRepository({
        findById: jest
          .fn()
          .mockResolvedValue(
            makeFilingSuggestion({ existingFolderIds: [INVENTE], newFolderNames: [] }),
          ),
      });
      const conversations = makeConversationRepository();

      await expect(
        makeService(suggestions, makeFolderRepository(), conversations).resolve(
          USER,
          "sug-1",
          { action: "accept" },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 422 });

      expect(conversations.setFolders).not.toHaveBeenCalled();
      expect(suggestions.markResolved).not.toHaveBeenCalled();
      jest.restoreAllMocks();
    });

    it("ne range que dans les dossiers restés cochés", async () => {
      const suggestions = makeSuggestionRepository({
        findById: jest
          .fn()
          .mockResolvedValue(
            makeFilingSuggestion({ existingFolderIds: [SANTE], newFolderNames: ["Assurances"] }),
          ),
      });
      const folders = makeFolderRepository([makeFolder({ id: SANTE, name: "Santé" })]);
      const conversations = makeConversationRepository();

      await makeService(suggestions, folders, conversations).resolve(
        USER,
        "sug-1",
        {
          action: "accept",
          folderSelection: { existingFolderIds: [SANTE], newFolderNames: [] },
        },
        TOKEN,
      );

      // Le dossier décoché n'est pas créé : l'utilisateur retient une partie de
      // la proposition sans avoir à la refuser en entier (§5.2, A.1).
      expect(folders.create).not.toHaveBeenCalled();
      expect(assignedFolders(conversations)).toEqual([SANTE]);
    });

    it("ne laisse dans le fil que la trace des dossiers retenus", async () => {
      const suggestions = makeSuggestionRepository({
        findById: jest
          .fn()
          .mockResolvedValue(
            makeFilingSuggestion({ existingFolderIds: [SANTE, ASSURANCES], newFolderNames: [] }),
          ),
      });
      const folders = makeFolderRepository([
        makeFolder({ id: SANTE, name: "Santé" }),
        makeFolder({ id: ASSURANCES, name: "Assurances" }),
      ]);

      await makeService(suggestions, folders).resolve(
        USER,
        "sug-1",
        {
          action: "accept",
          folderSelection: { existingFolderIds: [ASSURANCES], newFolderNames: [] },
        },
        TOKEN,
      );

      // La ligne « Conversation rangée » se relit dans le fil : elle doit dire
      // ce qui a été fait, pas ce qui avait été proposé.
      expect(suggestions.markResolved).toHaveBeenCalledWith("sug-1", "accepted", TOKEN, {
        existingFolderIds: [ASSURANCES],
        newFolderNames: [],
      });
    });

    it("refuse une réponse qui ne retient aucun dossier proposé", async () => {
      const suggestions = makeSuggestionRepository({
        findById: jest
          .fn()
          .mockResolvedValue(
            makeFilingSuggestion({ existingFolderIds: [SANTE], newFolderNames: [] }),
          ),
      });
      const conversations = makeConversationRepository();

      await expect(
        makeService(suggestions, makeFolderRepository(), conversations).resolve(
          USER,
          "sug-1",
          {
            action: "accept",
            folderSelection: { existingFolderIds: [ASSURANCES], newFolderNames: [] },
          },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });

      // Le client ne peut que retirer des dossiers de la proposition : un
      // dossier qu'elle ne portait pas ne rentre pas par cette porte.
      expect(conversations.setFolders).not.toHaveBeenCalled();
      expect(suggestions.markResolved).not.toHaveBeenCalled();
    });
  });

  describe("refus d'une proposition", () => {
    it("ne crée aucun dossier", async () => {
      const folders = makeFolderRepository();
      const suggestions = makeSuggestionRepository();

      const resolved = await makeService(suggestions, folders).resolve(
        USER,
        "sug-1",
        { action: "dismiss" },
        TOKEN,
      );

      expect(folders.create).not.toHaveBeenCalled();
      expect(suggestions.markResolved).toHaveBeenCalledWith("sug-1", "dismissed", TOKEN);
      expect(resolved.folders).toEqual([]);
    });
  });

  describe("acceptation d'une todoliste (§12.1, A.2)", () => {
    it("garde les achats et les tâches dans deux listes distinctes", async () => {
      const tasks = makeTaskRepository();

      await makeService(
        makeSuggestionStore(makeJardinSuggestion()),
        makeFolderRepository(),
        makeConversationRepository(),
        tasks,
      ).resolve(USER, "sug-1", { action: "accept" }, TOKEN);

      // Les fusionner rendrait la liste de courses illisible au milieu du
      // désherbage — c'est l'exemple même du §12.1.
      expect(createdLists(tasks).map((list) => [list.title, list.kind])).toEqual([
        ["Achats jardin", "shopping"],
        ["Travaux jardin", "todo"],
      ]);
    });

    it("ajoute chaque tâche proposée à sa liste", async () => {
      const tasks = makeTaskRepository();

      const resolved = await makeService(
        makeSuggestionStore(makeJardinSuggestion()),
        makeFolderRepository(),
        makeConversationRepository(),
        tasks,
      ).resolve(USER, "sug-1", { action: "accept" }, TOKEN);

      const created = (await tasks.findAll(TOKEN, { limit: 100 })).items;
      expect(resolved.taskLists).toHaveLength(2);
      expect(created.map((list) => list.tasks.map((task) => task.title))).toEqual([
        ["Terreau"],
        ["Désherber", "Tondre"],
      ]);
    });

    it("date la liste entière et non ses lignes", async () => {
      const tasks = makeTaskRepository();

      await makeService(
        makeSuggestionStore(makeJardinSuggestion()),
        makeFolderRepository(),
        makeConversationRepository(),
        tasks,
      ).resolve(USER, "sug-1", { action: "accept" }, TOKEN);

      // « Avant samedi » date le travail à faire, pas le sac de terreau : les
      // achats restent sans échéance.
      expect(createdLists(tasks).map((list) => [list.title, list.dueAt ?? null])).toEqual([
        ["Achats jardin", null],
        ["Travaux jardin", DESHERBAGE],
      ]);
    });

    it("marque les listes comme venant de l'assistant et de leur conversation", async () => {
      const tasks = makeTaskRepository();

      await makeService(
        makeSuggestionStore(makeJardinSuggestion()),
        makeFolderRepository(),
        makeConversationRepository(),
        tasks,
      ).resolve(USER, "sug-1", { action: "accept" }, TOKEN);

      expect(createdLists(tasks)[0]).toMatchObject({
        conversationId: "conv-1",
        createdByAssistant: true,
      });
    });

    it("range les listes dans le dossier de la conversation d'origine", async () => {
      const tasks = makeTaskRepository();
      const conversations = makeConversationRepository({
        findById: jest.fn().mockResolvedValue(makeConversation([SANTE, ASSURANCES])),
      });

      await makeService(
        makeSuggestionStore(makeJardinSuggestion()),
        makeFolderRepository(),
        conversations,
        tasks,
      ).resolve(USER, "sug-1", { action: "accept" }, TOKEN);

      // Jamais demandé à l'utilisateur (§13.4.1) : la liste hérite du rangement
      // que la conversation exprime déjà.
      expect(createdLists(tasks).map((list) => list.folderId)).toEqual([SANTE, SANTE]);
    });

    it("range chaque liste dans le sous-dossier typé du projet, quand il existe (A.4)", async () => {
      const jardin = uuid(201);
      const achat = uuid(202);
      const todo = uuid(203);
      const tasks = makeTaskRepository();
      const folders = makeFolderRepository([
        makeFolder({ id: jardin, name: "Jardin" }),
        makeFolder({ id: achat, name: "ACHAT", parentId: jardin, purpose: "purchase" }),
        makeFolder({ id: todo, name: "TODO", parentId: jardin, purpose: "todo" }),
      ]);
      const conversations = makeConversationRepository({
        findById: jest.fn().mockResolvedValue(makeConversation([jardin])),
      });

      await makeService(
        makeSuggestionStore(makeJardinSuggestion()),
        folders,
        conversations,
        tasks,
      ).resolve(USER, "sug-1", { action: "accept" }, TOKEN);

      // La liste d'achats rejoint ACHAT, la liste de tâches rejoint TODO — pas
      // le dossier Jardin lui-même.
      expect(createdLists(tasks).map((list) => [list.title, list.folderId])).toEqual([
        ["Achats jardin", achat],
        ["Travaux jardin", todo],
      ]);
    });

    it("retombe sur le dossier de la conversation quand aucun sous-dossier ne correspond au type de liste", async () => {
      const jardin = uuid(204);
      const idee = uuid(205);
      const tasks = makeTaskRepository();
      const folders = makeFolderRepository([
        makeFolder({ id: jardin, name: "Jardin" }),
        makeFolder({ id: idee, name: "IDÉE", parentId: jardin, purpose: "idea" }),
      ]);
      const conversations = makeConversationRepository({
        findById: jest.fn().mockResolvedValue(makeConversation([jardin])),
      });

      await makeService(
        makeSuggestionStore(makeJardinSuggestion()),
        folders,
        conversations,
        tasks,
      ).resolve(USER, "sug-1", { action: "accept" }, TOKEN);

      expect(createdLists(tasks).map((list) => list.folderId)).toEqual([jardin, jardin]);
    });

    it("laisse les listes hors dossier quand la conversation n'est pas rangée", async () => {
      const tasks = makeTaskRepository();

      await makeService(
        makeSuggestionStore(makeJardinSuggestion()),
        makeFolderRepository(),
        makeConversationRepository(),
        tasks,
      ).resolve(USER, "sug-1", { action: "accept" }, TOKEN);

      expect(createdLists(tasks).map((list) => list.folderId)).toEqual([null, null]);
    });

    it("enchaîne sur une proposition de créneaux pour les listes datées", async () => {
      const resolved = await makeService(makeSuggestionStore(makeJardinSuggestion())).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      // Deuxième temps du §12.1 : une proposition, pas un créneau posé d'office.
      expect(resolved.next).toMatchObject({
        kind: "schedule_task",
        status: "pending",
        message: "Cette liste porte une échéance. Je te bloque le créneau dans ton agenda ?",
      });
      expect(resolved.events).toEqual([]);
    });

    it("n'enchaîne sur rien quand aucune liste ne porte d'échéance", async () => {
      const sansDate = makeSuggestion({
        kind: "create_task_list",
        message: "Je te l'organise ?",
        payload: {
          lists: [{ title: "Courses", kind: "shopping", items: [{ title: "Terreau" }] }],
        },
      });

      const resolved = await makeService(makeSuggestionStore(sansDate)).resolve(
        USER,
        "sug-1",
        { action: "accept" },
        TOKEN,
      );

      expect(resolved.next).toBeNull();
    });

    it("ne crée aucune liste quand la proposition est ignorée", async () => {
      const tasks = makeTaskRepository();

      const resolved = await makeService(
        makeSuggestionStore(makeJardinSuggestion()),
        makeFolderRepository(),
        makeConversationRepository(),
        tasks,
      ).resolve(USER, "sug-1", { action: "dismiss" }, TOKEN);

      expect(resolved.taskLists).toEqual([]);
      expect(tasks.createList).not.toHaveBeenCalled();
    });
  });

  describe("acceptation d'une complétion de liste (§12.1, A.2)", () => {
    /** Crée la liste du jardin, puis rend l'identifiant de la liste de tâches. */
    async function withTravauxList() {
      const tasks = makeTaskRepository();
      await makeService(
        makeSuggestionStore(makeJardinSuggestion()),
        makeFolderRepository(),
        makeConversationRepository(),
        tasks,
      ).resolve(USER, "sug-1", { action: "accept" }, TOKEN);

      const travaux = (await tasks.findAll(TOKEN, { limit: 100 })).items.find(
        (list) => list.title === "Travaux jardin",
      );
      if (!travaux) throw new Error("La liste de travaux devrait exister");
      return { tasks, listId: travaux.id };
    }

    it("ajoute les lignes proposées à la liste existante, sans en créer une seconde", async () => {
      const { tasks, listId } = await withTravauxList();
      const before = (tasks.createList as jest.Mock).mock.calls.length;

      await makeService(
        makeSuggestionStore(
          makeSuggestion({
            kind: "add_task_list_items",
            message: "J'ajoute tailler la haie et arroser ?",
            payload: { listId, items: [{ title: "Tailler la haie" }, { title: "Arroser" }] },
          }),
        ),
        makeFolderRepository(),
        makeConversationRepository(),
        tasks,
      ).resolve(USER, "sug-1", { action: "accept" }, TOKEN);

      const travaux = (await tasks.findAll(TOKEN, { limit: 100 })).items.find(
        (list) => list.title === "Travaux jardin",
      );
      expect(travaux?.tasks.map((task) => task.title)).toEqual([
        "Désherber",
        "Tondre",
        "Tailler la haie",
        "Arroser",
      ]);
      // Le point de départ du défaut corrigé : le modèle reproposait une liste
      // homonyme au lieu de compléter celle-ci.
      expect((tasks.createList as jest.Mock).mock.calls.length).toBe(before);
    });

    it("ajoute les lignes à la suite des positions déjà prises", async () => {
      const { tasks, listId } = await withTravauxList();

      await makeService(
        makeSuggestionStore(
          makeSuggestion({
            kind: "add_task_list_items",
            message: "J'ajoute arroser ?",
            payload: { listId, items: [{ title: "Arroser" }] },
          }),
        ),
        makeFolderRepository(),
        makeConversationRepository(),
        tasks,
      ).resolve(USER, "sug-1", { action: "accept" }, TOKEN);

      const travaux = (await tasks.findAll(TOKEN, { limit: 100 })).items.find(
        (list) => list.title === "Travaux jardin",
      );
      expect(travaux?.tasks.map((task) => task.position)).toEqual([0, 1, 2]);
    });

    it("refuse une complétion dont la charge utile est illisible", async () => {
      const tasks = makeTaskRepository();

      await expect(
        makeService(
          makeSuggestionStore(
            makeSuggestion({
              kind: "add_task_list_items",
              message: "J'ajoute quelque chose ?",
              payload: { items: [{ title: "Arroser" }] },
            }),
          ),
          makeFolderRepository(),
          makeConversationRepository(),
          tasks,
        ).resolve(USER, "sug-1", { action: "accept" }, TOKEN),
      ).rejects.toMatchObject({ status: 422 });
    });
  });

  describe("acceptation des créneaux (A.3)", () => {
    /** Joue les deux temps : les listes d'abord, leurs créneaux ensuite. */
    async function acceptBothCards() {
      const tasks = makeTaskRepository();
      const events = makeCalendarRepository();
      const service = makeService(
        makeSuggestionStore(makeJardinSuggestion()),
        makeFolderRepository(),
        makeConversationRepository(),
        tasks,
        events,
      );

      const first = await service.resolve(USER, "sug-1", { action: "accept" }, TOKEN);
      if (!first.next) throw new Error("La proposition de créneaux devrait exister");

      const second = await service.resolve(USER, first.next.id, { action: "accept" }, TOKEN);
      return { second, tasks, events };
    }

    it("pose un créneau par liste datée, sans heure de fin inventée", async () => {
      const { second, events } = await acceptBothCards();

      // Un seul créneau pour les deux tâches du jardin : c'est la liste qui
      // porte l'échéance, pas chacune de ses lignes.
      expect(second.events).toHaveLength(1);
      expect(events.create).toHaveBeenCalledWith(
        USER,
        { title: "Travaux jardin", startsAt: DESHERBAGE, endsAt: null, allDay: false },
        TOKEN,
      );
    });

    it("rattache la liste à son créneau", async () => {
      const { second, tasks } = await acceptBothCards();

      const travaux = (await tasks.findAll(TOKEN, { limit: 100 })).items.find(
        (list) => list.title === "Travaux jardin",
      );

      // Sans ce lien, le calendrier montrerait deux fois la même échéance : la
      // liste datée et le créneau posé pour elle.
      expect(travaux?.eventId).toBe(second.events[0]?.id);
    });
  });

  describe("propositions en attente", () => {
    it("refuse de traiter une proposition introuvable", async () => {
      const suggestions = makeSuggestionRepository({ findById: jest.fn().mockResolvedValue(null) });

      await expect(
        makeService(suggestions).resolve(USER, "sug-1", { action: "accept" }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("liste celles du fil demandé, tranchées comprises", async () => {
      const history = [makeSuggestion({ status: "accepted" }), makeSuggestion({ id: "sug-2" })];
      const suggestions = makeSuggestionRepository({
        listForConversation: jest.fn().mockResolvedValue(history),
      });

      await expect(makeService(suggestions).listForConversation("conv-1", TOKEN)).resolves.toEqual(
        history,
      );
      expect(suggestions.listForConversation).toHaveBeenCalledWith("conv-1", TOKEN);
    });
  });
});
