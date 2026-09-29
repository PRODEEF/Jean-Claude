import type {
  Group,
  GroupEventSuggestion,
  GroupListSuggestion,
  GroupMessage,
  WorkspaceTaskList,
} from "@jc/domain";
import type {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmProvider,
} from "../../core/llm/llm.port.js";
import type { IWorkspaceListRepository } from "../workspace-list/workspace-list.repository.interface.js";
import { WorkspaceListService } from "../workspace-list/workspace-list.service.js";
import type {
  AttachmentRecord,
  IAttachmentRepository,
} from "../attachment/attachment.repository.interface.js";
import type { IWorkspaceEventRepository } from "../workspace-event/workspace-event.repository.interface.js";
import { WorkspaceEventService } from "../workspace-event/workspace-event.service.js";
import type { IGroupRepository } from "./group.repository.interface.js";
import {
  describeThread,
  GROUP_PAUSE_MS,
  GROUP_QUOTA_REACHED,
  GROUP_REPLY_FAILED,
  GROUP_WELCOME,
  GroupService,
  groupSystemPrompt,
  toEventProposal,
  toListProposal,
  type GroupAssistantDeps,
} from "./group.service.js";

const TOKEN = "access-token";
const WORKSPACE_ID = "ws-1";

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: "group-1",
    workspaceId: WORKSPACE_ID,
    title: "Bureau",
    memberIds: ["alice", "bruno"],
    folderIds: [],
    aiMuted: false,
    unreadCount: 0,
    lastMessageAt: null,
    createdAt: "2026-09-29T08:00:00.000Z",
    ...overrides,
  };
}

function makeMessage(overrides: Partial<GroupMessage> = {}): GroupMessage {
  return {
    id: "msg-1",
    groupId: "group-1",
    authorId: "alice",
    role: "user",
    content: "Bonjour",
    replyTo: null,
    attachments: [],
    removedAttachments: [],
    announcement: false,
    createdAt: "2026-09-29T08:00:00.000Z",
    ...overrides,
  };
}

const MEMBERS = [
  { userId: "alice", displayName: "Alice" },
  { userId: "bruno", displayName: "Bruno" },
  { userId: "chloe", displayName: null },
];

function makeRepository(overrides: Partial<IGroupRepository> = {}): IGroupRepository {
  return {
    findWorkspaceMembers: jest.fn().mockResolvedValue([]),
    findByWorkspace: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(async (_userId, input) => makeGroup(input)),
    setAiMuted: jest.fn().mockResolvedValue(undefined),
    findWorkspaceFolderIds: jest.fn().mockResolvedValue([]),
    setFolders: jest.fn().mockResolvedValue(undefined),
    findMessages: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    findLatestMessageId: jest.fn().mockResolvedValue(null),
    findMessage: jest.fn().mockResolvedValue(null),
    appendMessage: jest.fn().mockResolvedValue(makeMessage()),
    appendAssistantMessage: jest.fn().mockResolvedValue(makeMessage({ role: "assistant" })),
    appendSystemMessage: jest.fn().mockResolvedValue(makeMessage({ role: "system" })),
    findAssistantModel: jest.fn().mockResolvedValue(null),
    createListSuggestion: jest
      .fn()
      .mockImplementation(async (groupId, messageId, _userId, proposal) =>
        makeSuggestion({ groupId, messageId, ...proposal }),
      ),
    findListSuggestions: jest.fn().mockResolvedValue([]),
    resolveListSuggestion: jest.fn().mockResolvedValue(null),
    setSuggestionList: jest.fn().mockResolvedValue(undefined),
    reopenListSuggestion: jest.fn().mockResolvedValue(undefined),
    markRead: jest.fn().mockResolvedValue(undefined),
    findTimezone: jest.fn().mockResolvedValue("Europe/Paris"),
    createEventSuggestion: jest
      .fn()
      .mockImplementation(async (groupId, messageId, _userId, proposal) =>
        makeEventSuggestion({ groupId, messageId, ...proposal }),
      ),
    findEventSuggestions: jest.fn().mockResolvedValue([]),
    resolveEventSuggestion: jest.fn().mockResolvedValue(null),
    setSuggestionEvent: jest.fn().mockResolvedValue(undefined),
    reopenEventSuggestion: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeSuggestion(overrides: Partial<GroupListSuggestion> = {}): GroupListSuggestion {
  return {
    id: "sugg-1",
    groupId: "group-1",
    messageId: "msg-jc",
    title: "Kermesse",
    tasks: [{ title: "Réserver la salle", assigneeId: "bruno" }],
    status: "pending",
    listId: null,
    createdAt: "2026-09-29T08:00:00.000Z",
    ...overrides,
  };
}

/** Dépôt des listes où tout le monde est membre et où la création réussit. */
function makeListRepository(
  overrides: Partial<IWorkspaceListRepository> = {},
): IWorkspaceListRepository {
  const created: WorkspaceTaskList = {
    id: "list-9",
    workspaceId: WORKSPACE_ID,
    title: "Kermesse",
    folderId: null,
    conversationId: "group-1",
    tasks: [],
    createdAt: "2026-09-29T08:00:00.000Z",
    updatedAt: "2026-09-29T08:00:00.000Z",
  };
  return {
    findWorkspaceMemberIds: jest.fn().mockResolvedValue(["alice", "bruno", "chloe"]),
    findWorkspaceFolderIds: jest.fn().mockResolvedValue([]),
    findByWorkspace: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(created),
    create: jest.fn().mockResolvedValue(created),
    update: jest.fn(),
    delete: jest.fn(),
    addTask: jest.fn(),
    updateTask: jest.fn(),
    deleteTask: jest.fn(),
    ...overrides,
  };
}

/** Espace dont Alice, Bruno et Chloé sont membres. */
function inWorkspace(overrides: Partial<IGroupRepository> = {}): IGroupRepository {
  return makeRepository({
    findWorkspaceMembers: jest.fn().mockResolvedValue(MEMBERS),
    ...overrides,
  });
}

function response(overrides: Partial<LlmCompletionResponse> = {}): LlmCompletionResponse {
  return {
    text: "",
    toolCalls: [],
    provider: "mistral",
    model: "mistral/ministral-14b",
    usage: { inputTokens: 0, outputTokens: 0 },
    ...overrides,
  };
}

/** Moteur qui rend, dans l'ordre, les réponses fournies et garde trace des requêtes. */
function makeLlm(...responses: LlmCompletionResponse[]) {
  const requests: LlmCompletionRequest[] = [];
  const llm: LlmProvider = {
    name: "fake",
    isSovereign: true,
    model: "mistral/ministral-14b",
    async *stream(request) {
      requests.push(request);
      const next = responses.shift() ?? response();
      yield { type: "done", response: next };
    },
  };
  return { llm, requests };
}

const verdict = (intervene: boolean, reason: string) =>
  response({
    toolCalls: [{ id: "t1", name: "decide_intervention", input: { intervene, reason } }],
  });

function makeDeps(
  llm: LlmProvider,
  overrides: Partial<GroupAssistantDeps> = {},
): GroupAssistantDeps {
  return {
    llm,
    decisionModel: "mistral/ministral-8b",
    runAfterResponse: jest.fn(),
    consumeLlmCall: jest.fn().mockResolvedValue(true),
    wait: jest.fn().mockResolvedValue(undefined),
    now: () => NOW,
    ...overrides,
  };
}

function service(
  repo: IGroupRepository,
  deps: GroupAssistantDeps = makeDeps(makeLlm().llm),
  lists: IWorkspaceListRepository = makeListRepository(),
  attachments: IAttachmentRepository = makeAttachmentRepository(),
  events: IWorkspaceEventRepository = makeEventRepository(),
) {
  return new GroupService(
    repo,
    deps,
    new WorkspaceListService(lists),
    attachments,
    new WorkspaceEventService(events),
  );
}

/** Jeudi 1er octobre 2026, 10 h à Paris. */
const NOW = new Date("2026-10-01T08:00:00.000Z");

function makeEventSuggestion(overrides: Partial<GroupEventSuggestion> = {}): GroupEventSuggestion {
  return {
    id: "evs-1",
    groupId: "group-1",
    messageId: "msg-1",
    title: "Réunion",
    startsAt: "2026-10-02T16:00:00.000Z",
    endsAt: null,
    allDay: false,
    notes: null,
    status: "pending",
    eventId: null,
    createdAt: "2026-10-01T08:00:00.000Z",
    ...overrides,
  };
}

function makeEventRepository(
  overrides: Partial<IWorkspaceEventRepository> = {},
): IWorkspaceEventRepository {
  return {
    findSpace: jest.fn().mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      workspaceName: "Club",
      groupId: "group-1",
      groupTitle: "Bureau",
    }),
    findById: jest.fn().mockResolvedValue(null),
    findInRange: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation(async (userId, input) => ({
      id: "wev-1",
      groupId: input.groupId,
      title: input.title,
      notes: input.notes ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      allDay: input.allDay,
      reminderMinutesBefore: null,
      createdBy: userId,
      createdByAssistant: true,
      createdAt: "2026-10-01T08:00:00.000Z",
      updatedAt: "2026-10-01T08:00:00.000Z",
    })),
    update: jest.fn(),
    delete: jest.fn(),
    findAuthor: jest.fn().mockResolvedValue({ displayName: "Bruno", timezone: "Europe/Paris" }),
    appendSystemMessage: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeAttachmentRecord(overrides: Partial<AttachmentRecord> = {}): AttachmentRecord {
  return {
    id: "att-1",
    messageId: null,
    userId: "alice",
    workspaceId: WORKSPACE_ID,
    deletedAt: null,
    url: "https://storage.example/budget.pdf",
    fileName: "budget.pdf",
    mimeType: "application/pdf",
    byteSize: 2048,
    extractedText: "Budget 2027 : 12 000 €",
    createdAt: "2026-09-30T08:00:00.000Z",
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
    softDelete: jest.fn().mockResolvedValue(undefined),
    findWorkspaceRole: jest.fn().mockResolvedValue(null),
    findWorkspaceFiles: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    findWorkspaceFolders: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

const proposalCall = (input: Record<string, unknown>) =>
  response({
    text: "Voici qui fait quoi.",
    toolCalls: [{ id: "t2", name: "suggest_shared_list", input }],
  });

describe("GroupService", () => {
  describe("list", () => {
    it("liste les groupes de l'espace pour un membre", async () => {
      const repo = inWorkspace({ findByWorkspace: jest.fn().mockResolvedValue([makeGroup()]) });

      const groups = await service(repo).list(WORKSPACE_ID, "alice", TOKEN);

      expect(groups).toHaveLength(1);
      expect(repo.findByWorkspace).toHaveBeenCalledWith(WORKSPACE_ID, "alice", TOKEN);
    });

    it("répond introuvable à qui n'est pas membre de l'espace", async () => {
      const repo = inWorkspace();

      await expect(service(repo).list(WORKSPACE_ID, "dora", TOKEN)).rejects.toMatchObject({
        status: 404,
      });
      expect(repo.findByWorkspace).not.toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("crée le groupe avec les personnes choisies, le créateur en plus", async () => {
      const repo = inWorkspace();

      await service(repo).create(
        "alice",
        { workspaceId: WORKSPACE_ID, title: "Bureau", memberIds: ["bruno", "chloe"] },
        TOKEN,
      );

      expect(repo.create).toHaveBeenCalledWith(
        "alice",
        { workspaceId: WORKSPACE_ID, title: "Bureau", memberIds: ["bruno", "chloe"] },
        TOKEN,
      );
    });

    it("ouvre la conversation par un mot d'accueil qui présente Jean-Claude", async () => {
      const repo = inWorkspace();

      const group = await service(repo).create(
        "alice",
        { workspaceId: WORKSPACE_ID, title: "Bureau", memberIds: ["bruno"] },
        TOKEN,
      );

      expect(repo.appendSystemMessage).toHaveBeenCalledWith(
        group.id,
        "alice",
        GROUP_WELCOME,
        TOKEN,
      );
      expect(GROUP_WELCOME).toContain("@Jean-Claude");
      expect(GROUP_WELCOME).toContain("jamais vos échanges privés");
    });

    it("n'écrit pas de mot d'accueil quand la création est refusée", async () => {
      const repo = inWorkspace();

      await expect(
        service(repo).create(
          "alice",
          { workspaceId: WORKSPACE_ID, title: "Bureau", memberIds: [] },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });

      expect(repo.appendSystemMessage).not.toHaveBeenCalled();
    });

    it("ne compte ni le créateur coché ni une personne cochée deux fois", async () => {
      const repo = inWorkspace();

      await service(repo).create(
        "alice",
        { workspaceId: WORKSPACE_ID, title: "Bureau", memberIds: ["alice", "bruno", "bruno"] },
        TOKEN,
      );

      expect(repo.create).toHaveBeenCalledWith(
        "alice",
        expect.objectContaining({ memberIds: ["bruno"] }),
        TOKEN,
      );
    });

    it("refuse un groupe où le créateur serait seul", async () => {
      const repo = inWorkspace();

      await expect(
        service(repo).create(
          "alice",
          { workspaceId: WORKSPACE_ID, title: "Seule", memberIds: ["alice"] },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("refuse une personne qui ne fait pas partie de l'espace", async () => {
      const repo = inWorkspace();

      await expect(
        service(repo).create(
          "alice",
          { workspaceId: WORKSPACE_ID, title: "Bureau", memberIds: ["bruno", "dora"] },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("refuse de créer un groupe dans un espace dont on n'est pas membre", async () => {
      const repo = inWorkspace();

      await expect(
        service(repo).create(
          "dora",
          { workspaceId: WORKSPACE_ID, title: "Intrus", memberIds: ["bruno"] },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("update", () => {
    it("active le bouton silence pour tout le groupe", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeGroup()) });

      const group = await service(repo).update("group-1", "bruno", { aiMuted: true }, TOKEN);

      expect(group.aiMuted).toBe(true);
      expect(repo.setAiMuted).toHaveBeenCalledWith("group-1", true, TOKEN);
    });

    it("annonce dans le fil qui a limité Jean-Claude aux mentions", async () => {
      const repo = inWorkspace({ findById: jest.fn().mockResolvedValue(makeGroup()) });

      await service(repo).update("group-1", "bruno", { aiMuted: true }, TOKEN);

      expect(repo.appendSystemMessage).toHaveBeenCalledWith(
        "group-1",
        "bruno",
        "Bruno a limité Jean-Claude aux mentions : il ne répond plus que si on l'appelle.",
        TOKEN,
      );
    });

    it("annonce dans le fil qui a rendu la parole à Jean-Claude", async () => {
      const repo = inWorkspace({
        findById: jest.fn().mockResolvedValue(makeGroup({ aiMuted: true })),
      });

      await service(repo).update("group-1", "alice", { aiMuted: false }, TOKEN);

      expect(repo.appendSystemMessage).toHaveBeenCalledWith(
        "group-1",
        "alice",
        "Alice a autorisé Jean-Claude à intervenir de lui-même.",
        TOKEN,
      );
    });

    it("nomme « Un membre » celui qui n'a pas choisi de nom", async () => {
      const repo = inWorkspace({ findById: jest.fn().mockResolvedValue(makeGroup()) });

      await service(repo).update("group-1", "chloe", { aiMuted: true }, TOKEN);

      expect(repo.appendSystemMessage).toHaveBeenCalledWith(
        "group-1",
        "chloe",
        expect.stringContaining("Un membre a limité"),
        TOKEN,
      );
    });

    it("n'écrit rien quand le réglage est déjà le bon", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeGroup()) });

      await service(repo).update("group-1", "bruno", { aiMuted: false }, TOKEN);

      expect(repo.setAiMuted).not.toHaveBeenCalled();
      expect(repo.appendSystemMessage).not.toHaveBeenCalled();
    });

    it("refuse le réglage à qui n'est pas membre du groupe", async () => {
      await expect(
        service(makeRepository()).update("group-1", "dora", { aiMuted: true }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("assignFolders", () => {
    it("range la conversation dans plusieurs dossiers de l'espace", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeGroup()),
        findWorkspaceFolderIds: jest.fn().mockResolvedValue(["f1", "f2", "f3"]),
      });

      const group = await service(repo).assignFolders(
        "group-1",
        "bruno",
        ["f1", "f3", "f1"],
        TOKEN,
      );

      expect(group.folderIds).toEqual(["f1", "f3"]);
      expect(repo.setFolders).toHaveBeenCalledWith("group-1", ["f1", "f3"], TOKEN);
    });

    it("sort la conversation de tous ses dossiers avec une liste vide", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeGroup({ folderIds: ["f1"] })),
      });

      const group = await service(repo).assignFolders("group-1", "bruno", [], TOKEN);

      expect(group.folderIds).toEqual([]);
      expect(repo.setFolders).toHaveBeenCalledWith("group-1", [], TOKEN);
    });

    it("refuse un dossier qui n'appartient pas à l'espace", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeGroup()),
        findWorkspaceFolderIds: jest.fn().mockResolvedValue(["f1"]),
      });

      await expect(
        service(repo).assignFolders("group-1", "bruno", ["f1", "perso"], TOKEN),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.setFolders).not.toHaveBeenCalled();
    });

    it("refuse le rangement à qui n'est pas membre de la conversation", async () => {
      await expect(
        service(makeRepository()).assignFolders("group-1", "dora", [], TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("send", () => {
    it("ajoute le message au fil et confie la suite à Jean-Claude", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeGroup()) });
      const deps = makeDeps(makeLlm().llm);

      const message = await service(repo, deps).send(
        "group-1",
        "alice",
        { content: "Bonjour", attachmentIds: [] },
        TOKEN,
      );

      expect(message.content).toBe("Bonjour");
      expect(repo.appendMessage).toHaveBeenCalledWith("group-1", "alice", "Bonjour", null, TOKEN);
      expect(deps.runAfterResponse).toHaveBeenCalledTimes(1);
    });

    it("ne dérange pas Jean-Claude quand le groupe l'a mis en silence", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeGroup({ aiMuted: true })),
      });
      const deps = makeDeps(makeLlm().llm);

      await service(repo, deps).send(
        "group-1",
        "alice",
        { content: "Bonjour", attachmentIds: [] },
        TOKEN,
      );

      expect(deps.runAfterResponse).not.toHaveBeenCalled();
    });

    it("appelle Jean-Claude sur mention, même en silence", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeGroup({ aiMuted: true })),
      });
      const deps = makeDeps(makeLlm().llm);

      await service(repo, deps).send(
        "group-1",
        "alice",
        { content: "@Jean-Claude tu résumes ?", attachmentIds: [] },
        TOKEN,
      );

      expect(deps.runAfterResponse).toHaveBeenCalledTimes(1);
    });

    it("rattache la réponse au message cité du même fil", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeGroup()),
        findMessage: jest.fn().mockResolvedValue(makeMessage({ id: "msg-3", authorId: "bruno" })),
      });

      await service(repo).send(
        "group-1",
        "alice",
        { content: "D'accord", replyToId: "msg-3", attachmentIds: [] },
        TOKEN,
      );

      expect(repo.findMessage).toHaveBeenCalledWith("group-1", "msg-3", TOKEN);
      expect(repo.appendMessage).toHaveBeenCalledWith(
        "group-1",
        "alice",
        "D'accord",
        "msg-3",
        TOKEN,
      );
    });

    it("refuse de citer un message absent de la conversation", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeGroup()) });

      await expect(
        service(repo).send(
          "group-1",
          "alice",
          { content: "Oui", replyToId: "ailleurs", attachmentIds: [] },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.appendMessage).not.toHaveBeenCalled();
    });

    it("appelle Jean-Claude quand on répond à l'un de ses messages, même en silence", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeGroup({ aiMuted: true })),
        findMessage: jest
          .fn()
          .mockResolvedValue(makeMessage({ id: "msg-4", role: "assistant", authorId: "bruno" })),
      });
      const deps = makeDeps(makeLlm().llm);

      await service(repo, deps).send(
        "group-1",
        "alice",
        { content: "Tu peux préciser ?", replyToId: "msg-4", attachmentIds: [] },
        TOKEN,
      );

      expect(deps.runAfterResponse).toHaveBeenCalledTimes(1);
    });

    it("ne dérange pas Jean-Claude en silence pour une réponse à un membre", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeGroup({ aiMuted: true })),
        findMessage: jest.fn().mockResolvedValue(makeMessage({ id: "msg-3", authorId: "bruno" })),
      });
      const deps = makeDeps(makeLlm().llm);

      await service(repo, deps).send(
        "group-1",
        "alice",
        { content: "D'accord", replyToId: "msg-3", attachmentIds: [] },
        TOKEN,
      );

      expect(deps.runAfterResponse).not.toHaveBeenCalled();
    });

    it("rattache au message les fichiers déposés dans l'espace, et les rend avec lui", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeGroup()) });
      const attachments = makeAttachmentRepository({
        findByIds: jest.fn().mockResolvedValue([makeAttachmentRecord()]),
      });

      const sent = await service(repo, undefined, undefined, attachments).send(
        "group-1",
        "alice",
        { content: "", attachmentIds: ["att-1"] },
        TOKEN,
      );

      expect(attachments.linkToMessage).toHaveBeenCalledWith(["att-1"], "msg-1", TOKEN);
      expect(sent.attachments).toEqual([
        expect.objectContaining({ id: "att-1", fileName: "budget.pdf" }),
      ]);
      expect(sent.attachments[0]).not.toHaveProperty("workspaceId");
    });

    it("refuse un fichier déposé dans un autre espace, avant d'écrire", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeGroup()) });
      const attachments = makeAttachmentRepository({
        findByIds: jest.fn().mockResolvedValue([makeAttachmentRecord({ workspaceId: "ws-autre" })]),
      });

      await expect(
        service(repo, undefined, undefined, attachments).send(
          "group-1",
          "alice",
          { content: "Voici", attachmentIds: ["att-1"] },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.appendMessage).not.toHaveBeenCalled();
    });

    it("refuse un fichier personnel", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeGroup()) });
      const attachments = makeAttachmentRepository({
        findByIds: jest.fn().mockResolvedValue([makeAttachmentRecord({ workspaceId: null })]),
      });

      await expect(
        service(repo, undefined, undefined, attachments).send(
          "group-1",
          "alice",
          { content: "Voici", attachmentIds: ["att-1"] },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.appendMessage).not.toHaveBeenCalled();
    });

    it("refuse un fichier déjà envoyé", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeGroup()) });
      const attachments = makeAttachmentRepository({
        findByIds: jest.fn().mockResolvedValue([makeAttachmentRecord({ messageId: "msg-ancien" })]),
      });

      await expect(
        service(repo, undefined, undefined, attachments).send(
          "group-1",
          "alice",
          { content: "Encore", attachmentIds: ["att-1"] },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(repo.appendMessage).not.toHaveBeenCalled();
    });

    it("refuse le fichier déposé par un autre membre, comme un fichier inconnu", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeGroup()) });
      const attachments = makeAttachmentRepository({
        findByIds: jest.fn().mockResolvedValue([makeAttachmentRecord({ userId: "bruno" })]),
      });

      await expect(
        service(repo, undefined, undefined, attachments).send(
          "group-1",
          "alice",
          { content: "Voici", attachmentIds: ["att-1", "att-inconnu"] },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.appendMessage).not.toHaveBeenCalled();
    });

    it("refuse d'écrire dans un groupe dont on n'est pas membre", async () => {
      const repo = makeRepository();

      await expect(
        service(repo).send("group-1", "dora", { content: "Intrusion", attachmentIds: [] }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.appendMessage).not.toHaveBeenCalled();
    });
  });

  describe("considerSpeaking", () => {
    const message = makeMessage({ id: "msg-9", authorId: "bruno", content: "On se voit quand ?" });

    it("répond à une mention sans attendre ni demander l'avis du petit modèle", async () => {
      const { llm, requests } = makeLlm(response({ text: "Jeudi 18 h, comme convenu." }));
      const repo = inWorkspace({
        findAssistantModel: jest.fn().mockResolvedValue("openai/gpt-5.4-mini"),
      });
      const deps = makeDeps(llm);

      await service(repo, deps).considerSpeaking(makeGroup(), message, true, TOKEN);

      expect(deps.wait).not.toHaveBeenCalled();
      expect(requests).toHaveLength(1);
      expect(requests[0]?.model).toBe("openai/gpt-5.4-mini");
      expect(repo.appendAssistantMessage).toHaveBeenCalledWith(
        "group-1",
        "bruno",
        expect.objectContaining({ content: "Jeudi 18 h, comme convenu." }),
        TOKEN,
      );
    });

    it("répond avec le modèle par défaut quand le membre n'en a pas choisi", async () => {
      const { llm, requests } = makeLlm(response({ text: "D'accord." }));

      await service(inWorkspace(), makeDeps(llm)).considerSpeaking(
        makeGroup(),
        message,
        true,
        TOKEN,
      );

      expect(requests[0]?.model).toBeUndefined();
    });

    it("se tait quand un autre message arrive pendant la pause", async () => {
      const { llm, requests } = makeLlm();
      const repo = inWorkspace({ findLatestMessageId: jest.fn().mockResolvedValue("msg-10") });
      const deps = makeDeps(llm);

      await service(repo, deps).considerSpeaking(makeGroup(), message, false, TOKEN);

      expect(deps.wait).toHaveBeenCalledWith(GROUP_PAUSE_MS);
      expect(requests).toHaveLength(0);
    });

    it("se tait quand le petit modèle ne voit aucune raison de parler", async () => {
      const { llm, requests } = makeLlm(verdict(false, "none"));
      const repo = inWorkspace({ findLatestMessageId: jest.fn().mockResolvedValue("msg-9") });

      await service(repo, makeDeps(llm)).considerSpeaking(makeGroup(), message, false, TOKEN);

      expect(requests).toHaveLength(1);
      expect(requests[0]?.model).toBe("mistral/ministral-8b");
      expect(repo.appendAssistantMessage).not.toHaveBeenCalled();
    });

    it("se tait quand le petit modèle répond sans utiliser son outil", async () => {
      const { llm } = makeLlm(response({ text: "Je pense qu'il faudrait répondre." }));
      const repo = inWorkspace({ findLatestMessageId: jest.fn().mockResolvedValue("msg-9") });

      await service(repo, makeDeps(llm)).considerSpeaking(makeGroup(), message, false, TOKEN);

      expect(repo.appendAssistantMessage).not.toHaveBeenCalled();
    });

    it("prend la parole sur une question restée sans réponse", async () => {
      const { llm, requests } = makeLlm(
        verdict(true, "unanswered_question"),
        response({ text: "Jeudi à 18 h, d'après le message d'Alice." }),
      );
      const repo = inWorkspace({ findLatestMessageId: jest.fn().mockResolvedValue("msg-9") });

      await service(repo, makeDeps(llm)).considerSpeaking(makeGroup(), message, false, TOKEN);

      expect(requests).toHaveLength(2);
      expect(requests[1]?.system).toContain("restée sans réponse");
      expect(repo.appendAssistantMessage).toHaveBeenCalledTimes(1);
    });

    it("ne remet pas au modèle les annonces du fil", async () => {
      const { llm } = makeLlm(response({ text: "Jeudi." }));
      const repo = inWorkspace();

      await service(repo, makeDeps(llm)).considerSpeaking(makeGroup(), message, true, TOKEN);

      expect(repo.findMessages).toHaveBeenCalledWith(
        "group-1",
        expect.objectContaining({ forModel: true }),
        TOKEN,
      );
    });

    it("explique dans le fil pourquoi il ne répond pas à une mention quand le quota est atteint", async () => {
      const { llm } = makeLlm(response({ text: "Réponse" }));
      const repo = inWorkspace();
      const deps = makeDeps(llm, { consumeLlmCall: jest.fn().mockResolvedValue(false) });

      await service(repo, deps).considerSpeaking(makeGroup(), message, true, TOKEN);

      expect(deps.consumeLlmCall).toHaveBeenCalledWith("bruno", TOKEN);
      expect(repo.appendAssistantMessage).not.toHaveBeenCalled();
      expect(repo.appendSystemMessage).toHaveBeenCalledWith(
        "group-1",
        "bruno",
        GROUP_QUOTA_REACHED,
        TOKEN,
      );
    });

    it("se tait sans rien annoncer quand le quota est atteint sur une intervention spontanée", async () => {
      const { llm } = makeLlm(verdict(true, "unanswered_question"));
      const repo = inWorkspace({ findLatestMessageId: jest.fn().mockResolvedValue("msg-9") });
      const deps = makeDeps(llm, { consumeLlmCall: jest.fn().mockResolvedValue(false) });

      await service(repo, deps).considerSpeaking(makeGroup(), message, false, TOKEN);

      expect(repo.appendAssistantMessage).not.toHaveBeenCalled();
      expect(repo.appendSystemMessage).not.toHaveBeenCalled();
    });

    it("annonce l'échec quand le modèle ne produit aucun texte pour une mention", async () => {
      const { llm } = makeLlm(response({ text: "   " }));
      const repo = inWorkspace();

      await service(repo, makeDeps(llm)).considerSpeaking(makeGroup(), message, true, TOKEN);

      expect(repo.appendAssistantMessage).not.toHaveBeenCalled();
      expect(repo.appendSystemMessage).toHaveBeenCalledWith(
        "group-1",
        "bruno",
        GROUP_REPLY_FAILED,
        TOKEN,
      );
    });

    it("annonce l'échec sans en livrer la cause quand le moteur plante sur une mention", async () => {
      const llm: LlmProvider = {
        name: "fake",
        isSovereign: true,
        model: "mistral/ministral-14b",
        // eslint-disable-next-line require-yield -- le moteur échoue avant tout morceau
        async *stream() {
          throw new Error("SELECT * FROM messages");
        },
      };
      const repo = inWorkspace();

      await service(repo, makeDeps(llm)).considerSpeaking(makeGroup(), message, true, TOKEN);

      expect(repo.appendSystemMessage).toHaveBeenCalledWith(
        "group-1",
        "bruno",
        GROUP_REPLY_FAILED,
        TOKEN,
      );
    });

    it("n'écrit rien quand le modèle ne produit aucun texte pour une intervention spontanée", async () => {
      const { llm } = makeLlm(verdict(true, "unanswered_question"), response({ text: "   " }));
      const repo = inWorkspace({ findLatestMessageId: jest.fn().mockResolvedValue("msg-9") });

      await service(repo, makeDeps(llm)).considerSpeaking(makeGroup(), message, false, TOKEN);

      expect(repo.appendAssistantMessage).not.toHaveBeenCalled();
      expect(repo.appendSystemMessage).not.toHaveBeenCalled();
    });
  });

  describe("listMessages", () => {
    it("transmet le curseur et la taille de page", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeGroup()) });

      await service(repo).listMessages(
        "group-1",
        "alice",
        { cursor: "2026-09-29T08:00:00.000Z", limit: 30 },
        TOKEN,
      );

      expect(repo.findMessages).toHaveBeenCalledWith(
        "group-1",
        { cursor: "2026-09-29T08:00:00.000Z", limit: 30 },
        TOKEN,
      );
    });

    it("refuse le fil à qui n'est pas membre du groupe", async () => {
      await expect(
        service(makeRepository()).listMessages("group-1", "dora", { limit: 30 }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("markRead", () => {
    it("remet les non-lus à zéro", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeGroup({ unreadCount: 3 })),
      });

      const group = await service(repo).markRead("group-1", "alice", TOKEN);

      expect(group.unreadCount).toBe(0);
      expect(repo.markRead).toHaveBeenCalledWith("group-1", "alice", TOKEN);
    });

    it("n'écrit rien quand tout est déjà lu", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeGroup()) });

      await service(repo).markRead("group-1", "alice", TOKEN);

      expect(repo.markRead).not.toHaveBeenCalled();
    });
  });
});

describe("propositions de liste", () => {
  const message = makeMessage({
    id: "msg-9",
    authorId: "alice",
    content: "Bruno réserve la salle.",
  });

  it("propose une liste quand le groupe se répartit le travail", async () => {
    const { llm, requests } = makeLlm(
      verdict(true, "decision_or_task"),
      proposalCall({
        title: "Kermesse",
        tasks: [{ title: "Réserver la salle", assignee: "Bruno" }, { title: "Affiches" }],
      }),
    );
    const repo = inWorkspace({
      findLatestMessageId: jest.fn().mockResolvedValue("msg-9"),
      appendAssistantMessage: jest
        .fn()
        .mockResolvedValue(makeMessage({ id: "msg-jc", role: "assistant" })),
    });

    await service(repo, makeDeps(llm)).considerSpeaking(makeGroup(), message, false, TOKEN);

    expect(requests[1]?.tools?.map((tool) => tool.name)).toEqual([
      "suggest_shared_list",
      "suggest_shared_event",
    ]);
    expect(repo.createListSuggestion).toHaveBeenCalledWith(
      "group-1",
      "msg-jc",
      "alice",
      {
        title: "Kermesse",
        tasks: [
          { title: "Réserver la salle", assigneeId: "bruno" },
          { title: "Affiches", assigneeId: null },
        ],
      },
      TOKEN,
    );
  });

  it("ne propose pas de liste pour une question restée sans réponse", async () => {
    const { llm, requests } = makeLlm(
      verdict(true, "unanswered_question"),
      proposalCall({ title: "Hors sujet", tasks: [{ title: "X" }] }),
    );
    const repo = inWorkspace({ findLatestMessageId: jest.fn().mockResolvedValue("msg-9") });

    await service(repo, makeDeps(llm)).considerSpeaking(makeGroup(), message, false, TOKEN);

    expect(requests[1]?.tools).toBeUndefined();
    expect(repo.createListSuggestion).not.toHaveBeenCalled();
  });

  it("pose la carte sous un message même quand le modèle n'a rien écrit", async () => {
    const { llm } = makeLlm(
      response({
        toolCalls: [
          {
            id: "t2",
            name: "suggest_shared_list",
            input: { title: "K", tasks: [{ title: "Salle" }] },
          },
        ],
      }),
    );
    const repo = inWorkspace();

    await service(repo, makeDeps(llm)).considerSpeaking(makeGroup(), message, true, TOKEN);

    expect(repo.appendAssistantMessage).toHaveBeenCalledWith(
      "group-1",
      "alice",
      expect.objectContaining({ content: "Je vous propose une liste :" }),
      TOKEN,
    );
    expect(repo.createListSuggestion).toHaveBeenCalledTimes(1);
  });

  describe("acceptSuggestion", () => {
    it("crée la liste de l'espace, rattachée à la conversation", async () => {
      const lists = makeListRepository();
      const repo = inWorkspace({
        findById: jest.fn().mockResolvedValue(makeGroup()),
        findListSuggestions: jest.fn().mockResolvedValue([makeSuggestion()]),
        resolveListSuggestion: jest.fn().mockResolvedValue(makeSuggestion({ status: "accepted" })),
      });

      const accepted = await service(repo, undefined, lists).acceptSuggestion(
        "group-1",
        "sugg-1",
        "chloe",
        TOKEN,
      );

      expect(accepted.listId).toBe("list-9");
      expect(lists.create).toHaveBeenCalledWith(
        "chloe",
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          conversationId: "group-1",
          tasks: [{ title: "Réserver la salle", assigneeId: "bruno", position: 0 }],
        }),
        TOKEN,
      );
      expect(repo.setSuggestionList).toHaveBeenCalledWith("sugg-1", "list-9", TOKEN);
    });

    it("libère la tâche d'un responsable parti de l'espace depuis la proposition", async () => {
      const lists = makeListRepository();
      const repo = inWorkspace({
        findById: jest.fn().mockResolvedValue(makeGroup()),
        findListSuggestions: jest.fn().mockResolvedValue([makeSuggestion()]),
        resolveListSuggestion: jest
          .fn()
          .mockResolvedValue(
            makeSuggestion({ status: "accepted", tasks: [{ title: "Salle", assigneeId: "zoe" }] }),
          ),
      });

      await service(repo, undefined, lists).acceptSuggestion("group-1", "sugg-1", "alice", TOKEN);

      expect(lists.create).toHaveBeenCalledWith(
        "alice",
        expect.objectContaining({ tasks: [{ title: "Salle", assigneeId: null, position: 0 }] }),
        TOKEN,
      );
    });

    it("refuse une proposition déjà tranchée par un autre membre", async () => {
      const repo = inWorkspace({
        findById: jest.fn().mockResolvedValue(makeGroup()),
        findListSuggestions: jest.fn().mockResolvedValue([makeSuggestion({ status: "dismissed" })]),
        resolveListSuggestion: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service(repo).acceptSuggestion("group-1", "sugg-1", "alice", TOKEN),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("répond introuvable pour une proposition d'une autre conversation", async () => {
      const repo = inWorkspace({ findById: jest.fn().mockResolvedValue(makeGroup()) });

      await expect(
        service(repo).acceptSuggestion("group-1", "sugg-1", "alice", TOKEN),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.resolveListSuggestion).not.toHaveBeenCalled();
    });

    it("remet la proposition en attente quand la création de la liste échoue", async () => {
      const lists = makeListRepository({ create: jest.fn().mockRejectedValue(new Error("panne")) });
      const repo = inWorkspace({
        findById: jest.fn().mockResolvedValue(makeGroup()),
        findListSuggestions: jest.fn().mockResolvedValue([makeSuggestion()]),
        resolveListSuggestion: jest.fn().mockResolvedValue(makeSuggestion({ status: "accepted" })),
      });

      await expect(
        service(repo, undefined, lists).acceptSuggestion("group-1", "sugg-1", "alice", TOKEN),
      ).rejects.toThrow("panne");
      expect(repo.reopenListSuggestion).toHaveBeenCalledWith("sugg-1", TOKEN);
    });
  });

  describe("dismissSuggestion", () => {
    it("ignore la proposition sans rien créer", async () => {
      const lists = makeListRepository();
      const repo = inWorkspace({
        findById: jest.fn().mockResolvedValue(makeGroup()),
        findListSuggestions: jest.fn().mockResolvedValue([makeSuggestion()]),
        resolveListSuggestion: jest.fn().mockResolvedValue(makeSuggestion({ status: "dismissed" })),
      });

      const dismissed = await service(repo, undefined, lists).dismissSuggestion(
        "group-1",
        "sugg-1",
        "bruno",
        TOKEN,
      );

      expect(dismissed.status).toBe("dismissed");
      expect(lists.create).not.toHaveBeenCalled();
    });
  });
});

describe("toListProposal", () => {
  it("retrouve les responsables par leur nom dans le fil, sans égard à la casse", () => {
    const proposal = toListProposal(
      {
        title: " Kermesse ",
        tasks: [
          { title: "Salle", assignee: "bruno" },
          { title: "Caisse", assignee: "Membre 1" },
        ],
      },
      MEMBERS,
    );

    expect(proposal).toEqual({
      title: "Kermesse",
      tasks: [
        { title: "Salle", assigneeId: "bruno" },
        { title: "Caisse", assigneeId: "chloe" },
      ],
    });
  });

  it("laisse libre une tâche confiée à un nom inconnu", () => {
    const proposal = toListProposal(
      { title: "K", tasks: [{ title: "Salle", assignee: "Zoé" }] },
      MEMBERS,
    );

    expect(proposal?.tasks[0]?.assigneeId).toBeNull();
  });

  it("écarte les tâches sans titre", () => {
    const proposal = toListProposal(
      { title: "K", tasks: [{ title: "  " }, { title: "Salle" }, 42] },
      MEMBERS,
    );

    expect(proposal?.tasks).toEqual([{ title: "Salle", assigneeId: null }]);
  });

  it("rend null sans titre ou sans tâche", () => {
    expect(toListProposal({ title: "", tasks: [{ title: "Salle" }] }, MEMBERS)).toBeNull();
    expect(toListProposal({ title: "K", tasks: [] }, MEMBERS)).toBeNull();
  });
});

describe("toEventProposal", () => {
  it("pose une heure murale dans le fuseau du membre", () => {
    expect(
      toEventProposal(
        { title: "Réunion", startsAt: "2026-10-02T18:00", endsAt: "2026-10-02T19:30" },
        "Europe/Paris",
      ),
    ).toEqual({
      title: "Réunion",
      startsAt: "2026-10-02T16:00:00.000Z",
      endsAt: "2026-10-02T17:30:00.000Z",
      allDay: false,
      notes: null,
    });
  });

  it("fait d'une date sans heure un événement sur la journée, sans fin", () => {
    expect(
      toEventProposal(
        { title: "Kermesse", startsAt: "2026-10-10", endsAt: "2026-10-10T18:00" },
        "Europe/Paris",
      ),
    ).toMatchObject({ allDay: true, endsAt: null, startsAt: "2026-10-09T22:00:00.000Z" });
  });

  it("abandonne une fin qui ne suit pas le début, et garde l'événement", () => {
    expect(
      toEventProposal(
        { title: "Réunion", startsAt: "2026-10-02T18:00", endsAt: "2026-10-02T17:00" },
        "Europe/Paris",
      ),
    ).toMatchObject({ endsAt: null });
  });

  it("garde le lieu en notes", () => {
    expect(
      toEventProposal(
        { title: "Réunion", startsAt: "2026-10-02T18:00", notes: " Salle Colbert " },
        "Europe/Paris",
      )?.notes,
    ).toBe("Salle Colbert");
  });

  it("refuse une proposition sans titre ou à la date illisible", () => {
    expect(toEventProposal({ title: "", startsAt: "2026-10-02T18:00" }, "Europe/Paris")).toBeNull();
    expect(toEventProposal({ title: "Réunion", startsAt: "vendredi" }, "Europe/Paris")).toBeNull();
    expect(toEventProposal({ title: "Réunion" }, "Europe/Paris")).toBeNull();
  });
});

describe("propositions d'événement", () => {
  const message = makeMessage({
    id: "msg-9",
    authorId: "alice",
    content: "@Jean-Claude ajoute la réunion de vendredi 18h",
  });
  const eventCall = response({
    text: "Je vous propose de l'ajouter au calendrier.",
    toolCalls: [
      {
        id: "t3",
        name: "suggest_shared_event",
        input: { title: "Réunion", startsAt: "2026-10-02T18:00" },
      },
    ],
  });

  it("pose la carte d'événement sous le message de Jean-Claude", async () => {
    const { llm, requests } = makeLlm(eventCall);
    const repo = inWorkspace();

    await service(repo, makeDeps(llm)).considerSpeaking(makeGroup(), message, true, TOKEN);

    expect(requests[0]?.tools?.map((tool) => tool.name)).toEqual([
      "suggest_shared_list",
      "suggest_shared_event",
    ]);
    expect(repo.createEventSuggestion).toHaveBeenCalledWith(
      "group-1",
      "msg-1",
      "alice",
      {
        title: "Réunion",
        startsAt: "2026-10-02T16:00:00.000Z",
        endsAt: null,
        allDay: false,
        notes: null,
      },
      TOKEN,
    );
  });

  it("ne propose rien quand il parle de lui-même sans décision", async () => {
    const { llm, requests } = makeLlm(
      response({
        toolCalls: [
          {
            id: "t1",
            name: "decide_intervention",
            input: { intervene: true, reason: "unanswered_question" },
          },
        ],
      }),
      eventCall,
    );
    const repo = inWorkspace({ findLatestMessageId: jest.fn().mockResolvedValue("msg-9") });

    await service(repo, makeDeps(llm)).considerSpeaking(makeGroup(), message, false, TOKEN);

    expect(requests[1]?.tools).toBeUndefined();
    expect(repo.createEventSuggestion).not.toHaveBeenCalled();
  });

  it("à l'acceptation, ajoute l'événement au calendrier de tous et le dit dans le fil", async () => {
    const repo = makeRepository({
      findById: jest.fn().mockResolvedValue(makeGroup()),
      findEventSuggestions: jest.fn().mockResolvedValue([makeEventSuggestion()]),
      resolveEventSuggestion: jest
        .fn()
        .mockResolvedValue(makeEventSuggestion({ status: "accepted" })),
    });
    const events = makeEventRepository();

    const accepted = await service(
      repo,
      undefined,
      undefined,
      undefined,
      events,
    ).acceptEventSuggestion("group-1", "evs-1", "bruno", TOKEN);

    expect(events.create).toHaveBeenCalledWith(
      "bruno",
      expect.objectContaining({ groupId: "group-1", title: "Réunion" }),
      true,
      TOKEN,
    );
    expect(events.appendSystemMessage).toHaveBeenCalled();
    expect(repo.setSuggestionEvent).toHaveBeenCalledWith("evs-1", "wev-1", TOKEN);
    expect(accepted.eventId).toBe("wev-1");
  });

  it("rouvre la proposition si l'événement n'a pas pu être créé", async () => {
    const repo = makeRepository({
      findById: jest.fn().mockResolvedValue(makeGroup()),
      findEventSuggestions: jest.fn().mockResolvedValue([makeEventSuggestion()]),
      resolveEventSuggestion: jest
        .fn()
        .mockResolvedValue(makeEventSuggestion({ status: "accepted" })),
    });
    const events = makeEventRepository({ create: jest.fn().mockRejectedValue(new Error("panne")) });

    await expect(
      service(repo, undefined, undefined, undefined, events).acceptEventSuggestion(
        "group-1",
        "evs-1",
        "bruno",
        TOKEN,
      ),
    ).rejects.toThrow("panne");
    expect(repo.reopenEventSuggestion).toHaveBeenCalledWith("evs-1", TOKEN);
  });

  it("dit au second membre que la proposition a déjà été traitée", async () => {
    const repo = makeRepository({
      findById: jest.fn().mockResolvedValue(makeGroup()),
      findEventSuggestions: jest.fn().mockResolvedValue([makeEventSuggestion()]),
    });

    await expect(
      service(repo).dismissEventSuggestion("group-1", "evs-1", "bruno", TOKEN),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("extractList", () => {
  const thread = {
    items: [makeMessage({ authorId: "bruno", content: "Je prends les chaises, Alice le café" })],
    nextCursor: null,
  };

  it("fait proposer par Jean-Claude une liste, posée en carte sous son message", async () => {
    const { llm, requests } = makeLlm(
      proposalCall({
        title: "Kermesse",
        tasks: [
          { title: "Chaises", assignee: "Bruno" },
          { title: "Café", assignee: "Alice" },
        ],
      }),
    );
    const repo = inWorkspace({
      findById: jest.fn().mockResolvedValue(makeGroup()),
      findMessages: jest.fn().mockResolvedValue(thread),
    });

    const suggestion = await service(repo, makeDeps(llm)).extractList("group-1", "alice", TOKEN);

    expect(requests[0]?.tools?.map((tool) => tool.name)).toEqual(["suggest_shared_list"]);
    expect(requests[0]?.system).toContain("N'invente aucune tâche");
    expect(repo.appendAssistantMessage).toHaveBeenCalledWith(
      "group-1",
      "alice",
      expect.objectContaining({ content: "Voici qui fait quoi." }),
      TOKEN,
    );
    expect(repo.createListSuggestion).toHaveBeenCalledWith(
      "group-1",
      "msg-1",
      "alice",
      {
        title: "Kermesse",
        tasks: [
          { title: "Chaises", assigneeId: "bruno" },
          { title: "Café", assigneeId: "alice" },
        ],
      },
      TOKEN,
    );
    expect(suggestion.title).toBe("Kermesse");
  });

  it("refuse une conversation vide, sans appeler le modèle", async () => {
    const { llm, requests } = makeLlm();
    const repo = inWorkspace({ findById: jest.fn().mockResolvedValue(makeGroup()) });

    await expect(
      service(repo, makeDeps(llm)).extractList("group-1", "alice", TOKEN),
    ).rejects.toMatchObject({ status: 422 });
    expect(requests).toHaveLength(0);
  });

  it("ne poste rien quand le modèle ne trouve pas de liste", async () => {
    const { llm } = makeLlm(response({ text: "Je ne vois rien à faire." }));
    const repo = inWorkspace({
      findById: jest.fn().mockResolvedValue(makeGroup()),
      findMessages: jest.fn().mockResolvedValue(thread),
    });

    await expect(
      service(repo, makeDeps(llm)).extractList("group-1", "alice", TOKEN),
    ).rejects.toMatchObject({ status: 422 });
    expect(repo.appendAssistantMessage).not.toHaveBeenCalled();
    expect(repo.createListSuggestion).not.toHaveBeenCalled();
  });

  it("rend un 404 à qui n'est pas membre de la conversation", async () => {
    const repo = inWorkspace();

    await expect(service(repo).extractList("group-1", "dora", TOKEN)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("describeThread", () => {
  it("signe chaque message du nom de son auteur", () => {
    const thread = describeThread(
      [
        makeMessage({ authorId: "alice", content: "Réunion jeudi ?" }),
        makeMessage({ authorId: "bruno", role: "assistant", content: "Jeudi convient." }),
      ],
      MEMBERS,
    );

    expect(thread).toBe("Alice : Réunion jeudi ?\nJean-Claude : Jeudi convient.");
  });

  it("numérote les membres sans nom plutôt que de livrer leur adresse", () => {
    const thread = describeThread(
      [makeMessage({ authorId: "chloe", content: "Présente" })],
      MEMBERS,
    );

    expect(thread).toBe("Membre 1 : Présente");
  });

  it("signale à quel message une réponse se rapporte, par un extrait", () => {
    const thread = describeThread(
      [
        makeMessage({
          authorId: "bruno",
          content: "Oui, je m'en charge",
          replyTo: {
            id: "msg-1",
            authorId: "alice",
            role: "assistant",
            content: "Qui   réserve\nla salle ?",
          },
        }),
      ],
      MEMBERS,
    );

    expect(thread).toBe(
      "Bruno, en réponse à Jean-Claude (« Qui réserve la salle ? ») : Oui, je m'en charge",
    );
  });

  it("remet au modèle le texte d'un fichier joint, balisé", () => {
    const thread = describeThread(
      [
        makeMessage({
          authorId: "alice",
          content: "Le budget",
          attachments: [
            {
              id: "att-1",
              url: "https://storage.example/budget.pdf",
              fileName: "budget.pdf",
              mimeType: "application/pdf",
              byteSize: 10,
              extractedText: "Total : 12 000 €",
              createdAt: "2026-09-30T08:00:00.000Z",
            },
          ],
        }),
      ],
      MEMBERS,
    );

    expect(thread).toBe(
      "Alice : Le budget\n[fichier joint : budget.pdf]\nTotal : 12 000 €\n[fin du fichier]",
    );
  });

  it("tronque le texte d'un long fichier", () => {
    const thread = describeThread(
      [
        makeMessage({
          authorId: "alice",
          content: "",
          attachments: [
            {
              id: "att-1",
              url: "https://storage.example/long.txt",
              fileName: "long.txt",
              mimeType: "text/plain",
              byteSize: 10,
              extractedText: "x".repeat(5_000),
              createdAt: "2026-09-30T08:00:00.000Z",
            },
          ],
        }),
      ],
      MEMBERS,
    );

    expect(thread).toContain(`${"x".repeat(4_000)}… [suite tronquée]`);
    expect(thread).not.toContain("x".repeat(4_001));
  });

  it("ne donne que le nom d'une image, et d'un fichier supprimé", () => {
    const thread = describeThread(
      [
        makeMessage({
          authorId: "bruno",
          content: "Photos",
          attachments: [
            {
              id: "att-1",
              url: "https://storage.example/salle.png",
              fileName: "salle.png",
              mimeType: "image/png",
              byteSize: 10,
              extractedText: null,
              createdAt: "2026-09-30T08:00:00.000Z",
            },
          ],
          removedAttachments: [{ id: "att-2", fileName: "ancien.pdf" }],
        }),
      ],
      MEMBERS,
    );

    expect(thread).toBe(
      "Bruno : Photos\n[image jointe, non visible : salle.png]\n[fichier supprimé : ancien.pdf]",
    );
  });

  it("tronque l'extrait d'un long message cité", () => {
    const long = "a".repeat(120);
    const thread = describeThread(
      [
        makeMessage({
          authorId: "bruno",
          content: "Vu",
          replyTo: { id: "msg-1", authorId: "alice", role: "user", content: long },
        }),
      ],
      MEMBERS,
    );

    expect(thread).toBe(`Bruno, en réponse à Alice (« ${"a".repeat(80)}… ») : Vu`);
  });

  it("rend telles quelles les lignes du calendrier, marquées comme telles", () => {
    const thread = describeThread(
      [
        makeMessage({
          role: "system",
          authorId: "bruno",
          content: "Bruno a déplacé « Réunion » au vendredi 2 octobre, 18 h.",
        }),
      ],
      MEMBERS,
    );

    expect(thread).toBe("[Calendrier] Bruno a déplacé « Réunion » au vendredi 2 octobre, 18 h.");
  });

  it("signe « Ancien membre » un auteur parti de l'espace", () => {
    const thread = describeThread([makeMessage({ authorId: "zoe", content: "Salut" })], MEMBERS);

    expect(thread).toBe("Ancien membre : Salut");
  });
});

const CLOCK = { now: NOW, timezone: "Europe/Paris" };

describe("groupSystemPrompt", () => {
  it("date la consigne dans le fuseau du membre", () => {
    expect(groupSystemPrompt("mention", CLOCK)).toContain(
      "Nous sommes jeudi 1 octobre 2026 à 10:00 (fuseau Europe/Paris).",
    );
  });

  it("rappelle que Jean-Claude propose et n'exécute rien", () => {
    expect(groupSystemPrompt("decision_or_task", CLOCK)).toContain("tu n'exécutes rien");
  });

  it("porte la consigne propre à la raison de parler", () => {
    expect(groupSystemPrompt("going_in_circles", CLOCK)).toContain("tourne en rond");
  });
});
