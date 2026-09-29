import type { Group, GroupListSuggestion, GroupMessage, WorkspaceTaskList } from "@jc/domain";
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
import type { IGroupRepository } from "./group.repository.interface.js";
import {
  describeThread,
  GROUP_PAUSE_MS,
  GroupService,
  groupSystemPrompt,
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
    ...overrides,
  };
}

function service(
  repo: IGroupRepository,
  deps: GroupAssistantDeps = makeDeps(makeLlm().llm),
  lists: IWorkspaceListRepository = makeListRepository(),
  attachments: IAttachmentRepository = makeAttachmentRepository(),
) {
  return new GroupService(repo, deps, new WorkspaceListService(lists), attachments);
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

    it("n'écrit rien quand le réglage est déjà le bon", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeGroup()) });

      await service(repo).update("group-1", "bruno", { aiMuted: false }, TOKEN);

      expect(repo.setAiMuted).not.toHaveBeenCalled();
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

    it("se tait quand le quota du membre est atteint", async () => {
      const { llm } = makeLlm(response({ text: "Réponse" }));
      const repo = inWorkspace();
      const deps = makeDeps(llm, { consumeLlmCall: jest.fn().mockResolvedValue(false) });

      await service(repo, deps).considerSpeaking(makeGroup(), message, true, TOKEN);

      expect(deps.consumeLlmCall).toHaveBeenCalledWith("bruno", TOKEN);
      expect(repo.appendAssistantMessage).not.toHaveBeenCalled();
    });

    it("n'écrit rien quand le modèle ne produit aucun texte", async () => {
      const { llm } = makeLlm(response({ text: "   " }));
      const repo = inWorkspace();

      await service(repo, makeDeps(llm)).considerSpeaking(makeGroup(), message, true, TOKEN);

      expect(repo.appendAssistantMessage).not.toHaveBeenCalled();
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

    expect(requests[1]?.tools?.map((tool) => tool.name)).toEqual(["suggest_shared_list"]);
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

  it("signe « Ancien membre » un auteur parti de l'espace", () => {
    const thread = describeThread([makeMessage({ authorId: "zoe", content: "Salut" })], MEMBERS);

    expect(thread).toBe("Ancien membre : Salut");
  });
});

describe("groupSystemPrompt", () => {
  it("rappelle que Jean-Claude propose et n'exécute rien", () => {
    expect(groupSystemPrompt("decision_or_task")).toContain("tu n'exécutes rien");
  });

  it("porte la consigne propre à la raison de parler", () => {
    expect(groupSystemPrompt("going_in_circles")).toContain("tourne en rond");
  });
});
