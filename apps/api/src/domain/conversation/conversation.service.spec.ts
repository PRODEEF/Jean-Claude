import { DEFAULT_CONVERSATION_TITLE } from "@jc/domain";
import type {
  AssistantScope,
  Conversation,
  Folder,
  Message,
  MessageStreamEvent,
  Suggestion,
  UserPreferences,
} from "@jc/domain";
import type { LlmCompletionRequest, LlmProvider, LlmToolCall } from "../../core/llm/llm.port.js";
import type { IFolderRepository } from "../folder/folder.repository.interface.js";
import { FolderService } from "../folder/folder.service.js";
import type { ISuggestionRepository } from "../suggestion/suggestion.repository.interface.js";
import { SuggestionService } from "../suggestion/suggestion.service.js";
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
    ...overrides,
  };
}

function makeMessage(
  overrides: Partial<Message> & Pick<Message, "id" | "role" | "content">,
): Message {
  return {
    conversationId: "conv-1",
    inputMode: "text",
    provider: null,
    model: null,
    choices: null,
    createdAt: "2026-08-31T08:00:00.000Z",
    ...overrides,
  };
}

function makeRepository(overrides: Partial<IConversationRepository> = {}): IConversationRepository {
  return {
    findAll: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    findById: jest.fn().mockResolvedValue(makeConversation()),
    findAssistantChannel: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(makeConversation()),
    update: jest.fn().mockResolvedValue(makeConversation()),
    delete: jest.fn().mockResolvedValue(undefined),
    setFolders: jest.fn().mockResolvedValue([]),
    listMessages: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    appendMessage: jest
      .fn()
      .mockImplementation((_id, _user, message: { role: Message["role"]; content: string }) =>
        Promise.resolve(makeMessage({ id: `msg-${message.role}`, ...message })),
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

function makeSuggestionRepository(
  overrides: Partial<ISuggestionRepository> = {},
): ISuggestionRepository {
  const suggestion: Suggestion = {
    id: "sug-1",
    kind: "create_project_folders",
    status: "pending",
    conversationId: "conv-1",
    message: "Je te crée un dossier Jardin ?",
    payload: {},
    createdAt: "2026-09-01T08:00:00.000Z",
    resolvedAt: null,
  };

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

function makePreferences(
  overrides: Partial<UserPreferences> = {},
  scope: Partial<AssistantScope> = {},
): UserPreferences {
  return {
    assistantName: "Jean-Claude",
    assistantColor: "#6366F1",
    theme: "system",
    timezone: "Europe/Paris",
    speakResponses: false,
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
  };
}

function makeService(
  repo: IConversationRepository = makeRepository(),
  llm: LlmProvider = makeLlm(),
  suggestions: ISuggestionRepository = makeSuggestionRepository(),
  folders: IFolderRepository = makeFolderRepository(),
  users: IUserRepository = makeUserRepository(),
): ConversationService {
  return new ConversationService(
    repo,
    llm,
    new SuggestionService(suggestions),
    new FolderService(folders),
    users,
  );
}

/** Requête effectivement transmise au moteur IA lors du dernier appel. */
function lastRequest(llm: LlmProvider): LlmCompletionRequest {
  const stream = llm.stream as jest.Mock;
  return stream.mock.calls[0]?.[0] as LlmCompletionRequest;
}

/** Déroule le tour de dialogue en entier, comme le fait le controller. */
async function drain(
  service: ConversationService,
  input = { content: "Bonjour", inputMode: "text" as const },
): Promise<MessageStreamEvent[]> {
  const events: MessageStreamEvent[] = [];
  for await (const event of service.streamMessage("conv-1", USER, input, TOKEN)) {
    events.push(event);
  }
  return events;
}

describe("ConversationService", () => {
  describe("getById", () => {
    it("signale une conversation introuvable plutôt que de renvoyer null", async () => {
      const service = makeService(
        makeRepository({ findById: jest.fn().mockResolvedValue(null) }),
        makeLlm(),
      );

      await expect(service.getById("absente", TOKEN)).rejects.toMatchObject({ status: 404 });
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
      const repo = makeRepository();

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

    it("accueille aussi dans un canal déjà ouvert mais resté vide (§6.3)", async () => {
      const repo = makeRepository({
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
      });

      expect(repo.appendMessage).toHaveBeenNthCalledWith(
        1,
        "conv-1",
        USER,
        { content: "Que planter en septembre ?", inputMode: "text", role: "user" },
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
        { content: "Raconte", inputMode: "text" },
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

    it("n'écrit aucune réponse d'assistant quand le modèle n'a rien produit", async () => {
      const repo = makeRepository();

      await drain(makeService(repo, makeLlm([])));

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
        { content: "Je monte une boîte de menuiserie.", inputMode: "text" },
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
        { content: "Je refais tout mon jardin ce printemps.", inputMode: "text" },
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
        { content: "Qu'est-ce qui est important aujourd'hui ?", inputMode: "text" },
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

    it("laisse une conversation classique sans bornage de périmètre", async () => {
      const llm = makeLlm();

      await drain(makeService(makeRepository(), llm), {
        content: "Une recette de tarte ?",
        inputMode: "text",
      });

      expect(lastRequest(llm).system ?? "").not.toContain("réservé à trois sujets");
    });

    it("expose les outils de suggestion au modèle sans jamais les exécuter (§12.1)", async () => {
      const llm = makeLlm();
      const repo = makeRepository();

      await drain(makeService(repo, llm), {
        content: "Il me faut du terreau et des bulbes.",
        inputMode: "text",
      });

      expect(lastRequest(llm).tools?.map((t) => t.name)).toContain("suggest_task_list");
      // Seuls les deux messages du tour sont écrits : aucune todoliste n'est
      // créée à la volée. L'assistant propose, il n'exécute pas.
      expect(repo.appendMessage).toHaveBeenCalledTimes(2);
    });

    it("n'expose au canal permanent que les outils de son périmètre (A.10)", async () => {
      const llm = makeLlm();
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
      });

      await drain(makeService(repo, llm), {
        content: "Aide-moi à ranger mon espace.",
        inputMode: "text",
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

    it("ouvre une conversation classique quand la demande sort du périmètre (A.10)", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeConversation({ kind: "assistant" })),
        create: jest
          .fn()
          .mockResolvedValue(makeConversation({ id: "conv-2", title: "Itinéraire en Bretagne" })),
      });
      const llm = makeLlm(
        ["Ça sort de notre fil, je t'ouvre une conversation dédiée."],
        [
          {
            id: "call-1",
            name: "open_new_conversation",
            input: { title: "Itinéraire en Bretagne" },
          },
        ],
      );

      const events = await drain(makeService(repo, llm), {
        content: "Propose-moi un itinéraire de 5 jours en Bretagne.",
        inputMode: "text",
      });

      expect(repo.create).toHaveBeenCalledWith(
        USER,
        { title: "Itinéraire en Bretagne", folderIds: [] },
        "chat",
        TOKEN,
      );
      // Émise après le message de l'assistant : le canal garde la trace de ce
      // qui a été demandé et de la bascule.
      expect(events.at(-1)).toEqual({
        type: "redirect",
        conversation: expect.objectContaining({ id: "conv-2" }),
      });
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

      const events = await drain(makeService(repo, llm), { content: "?", inputMode: "text" });

      // Ouvrir un fil sans titre serait plus déroutant que de ne pas basculer.
      expect(repo.create).not.toHaveBeenCalled();
      expect(events.some((event) => event.type === "redirect")).toBe(false);
      jest.restoreAllMocks();
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

    it("n'offre pas de rangement à un fil déjà classé", async () => {
      const llm = makeLlm();
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeConversation({ folderIds: ["folder-1"] })),
      });

      await drain(makeService(repo, llm));

      expect(lastRequest(llm).tools?.map((t) => t.name)).not.toContain("suggest_folders");
    });

    it("ne relance pas un rangement tant que la proposition précédente attend", async () => {
      const llm = makeLlm();
      const suggestions = makeSuggestionRepository({
        listPending: jest
          .fn()
          .mockResolvedValue([{ id: "sug-1", kind: "assign_folders", status: "pending" }]),
      });

      await drain(makeService(makeRepository(), llm, suggestions));

      // Sinon chaque message empilerait une carte sur un geste que
      // l'utilisateur a simplement laissé venir.
      expect(lastRequest(llm).tools?.map((t) => t.name)).not.toContain("suggest_folders");
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
        { content: "Il me faut du terreau et des bulbes.", inputMode: "text" },
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
        { content: "Aide-moi à ranger mon espace.", inputMode: "text" },
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
        { content: "Donne-moi une recette de tarte.", inputMode: "text" },
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
            input: { message: "Je range ça dans Santé ?", newFolderNames: ["Santé"] },
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
        }),
        { content: "Il me faut du terreau.", inputMode: "text" },
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
  });
});
