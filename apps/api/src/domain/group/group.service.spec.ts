import type { Group, GroupMessage } from "@jc/domain";
import type {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmProvider,
} from "../../core/llm/llm.port.js";
import type { IGroupRepository } from "./group.repository.interface.js";
import {
  describeThread,
  GROUP_PAUSE_MS,
  GROUP_QUOTA_REACHED,
  GROUP_REPLY_FAILED,
  GROUP_WELCOME,
  GroupService,
  groupSystemPrompt,
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
    appendMessage: jest.fn().mockResolvedValue(makeMessage()),
    appendAssistantMessage: jest.fn().mockResolvedValue(makeMessage({ role: "assistant" })),
    appendSystemMessage: jest.fn().mockResolvedValue(makeMessage({ role: "system" })),
    findAssistantModel: jest.fn().mockResolvedValue(null),
    markRead: jest.fn().mockResolvedValue(undefined),
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

function service(repo: IGroupRepository, deps: GroupAssistantDeps = makeDeps(makeLlm().llm)) {
  return new GroupService(repo, deps);
}

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
        { content: "Bonjour" },
        TOKEN,
      );

      expect(message.content).toBe("Bonjour");
      expect(repo.appendMessage).toHaveBeenCalledWith("group-1", "alice", "Bonjour", TOKEN);
      expect(deps.runAfterResponse).toHaveBeenCalledTimes(1);
    });

    it("ne dérange pas Jean-Claude quand le groupe l'a mis en silence", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeGroup({ aiMuted: true })),
      });
      const deps = makeDeps(makeLlm().llm);

      await service(repo, deps).send("group-1", "alice", { content: "Bonjour" }, TOKEN);

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
        { content: "@Jean-Claude tu résumes ?" },
        TOKEN,
      );

      expect(deps.runAfterResponse).toHaveBeenCalledTimes(1);
    });

    it("refuse d'écrire dans un groupe dont on n'est pas membre", async () => {
      const repo = makeRepository();

      await expect(
        service(repo).send("group-1", "dora", { content: "Intrusion" }, TOKEN),
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

  it("laisse les annonces du fil hors de ce que lit le modèle", () => {
    const thread = describeThread(
      [
        makeMessage({ authorId: "alice", role: "system", content: "Alice a limité Jean-Claude." }),
        makeMessage({ authorId: "bruno", content: "Bonjour" }),
      ],
      MEMBERS,
    );

    expect(thread).toBe("Bruno : Bonjour");
  });

  it("numérote les membres sans nom plutôt que de livrer leur adresse", () => {
    const thread = describeThread(
      [makeMessage({ authorId: "chloe", content: "Présente" })],
      MEMBERS,
    );

    expect(thread).toBe("Membre 1 : Présente");
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
