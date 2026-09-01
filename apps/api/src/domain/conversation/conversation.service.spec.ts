import type { Conversation, Message, MessageStreamEvent, Suggestion } from "@jc/domain";
import type { LlmCompletionRequest, LlmProvider, LlmToolCall } from "../../core/llm/llm.port";
import type { ISuggestionRepository } from "../suggestion/suggestion.repository.interface";
import { SuggestionService } from "../suggestion/suggestion.service";
import { ConversationService } from "./conversation.service";
import type { IConversationRepository } from "./conversation.repository.interface";

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

  return { name: "gateway", isSovereign: false, complete: jest.fn(), stream };
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
function makeService(
  repo: IConversationRepository = makeRepository(),
  llm: LlmProvider = makeLlm(),
  suggestions: ISuggestionRepository = makeSuggestionRepository(),
): ConversationService {
  return new ConversationService(repo, llm, new SuggestionService(suggestions));
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
