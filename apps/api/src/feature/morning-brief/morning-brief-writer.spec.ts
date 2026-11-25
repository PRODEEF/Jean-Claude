import type { LlmCompletionRequest, LlmProvider, LlmStreamChunk } from "../../core/llm/llm.port.js";
import { acceptable, createBriefWriter, type BriefAudience } from "./morning-brief-writer.js";

const AUDIENCE: BriefAudience = {
  displayName: "Yann",
  assistantName: "Jean-Claude",
  memory: "- Aime courir le matin.",
};

function makeLlm(reply: string | Error, seen: LlmCompletionRequest[] = []): LlmProvider {
  return {
    name: "test",
    isSovereign: true,
    model: "test/model",
    stream: (request) => {
      seen.push(request);
      return (async function* (): AsyncGenerator<LlmStreamChunk> {
        if (reply instanceof Error) throw reply;
        yield { type: "text", text: reply };
      })();
    },
  };
}

describe("createBriefWriter", () => {
  it("rend la phrase d'accueil du modèle", async () => {
    const write = createBriefWriter(makeLlm("Salut Yann, belle matinée devant toi :"));

    await expect(write(AUDIENCE, 3)).resolves.toBe("Salut Yann, belle matinée devant toi :");
  });

  it("retire les guillemets autour de la phrase", async () => {
    const write = createBriefWriter(makeLlm("« Bonjour Yann, voici ta journée : »"));

    await expect(write(AUDIENCE, 1)).resolves.toBe("Bonjour Yann, voici ta journée :");
  });

  it("refuse une phrase qui cite une heure : elle contredirait la liste", async () => {
    const write = createBriefWriter(makeLlm("Bonjour Yann, ton kiné est à 18h :"));

    await expect(write(AUDIENCE, 1)).rejects.toThrow("inutilisable");
  });

  it("transmet la mémoire au modèle, sans jamais lui demander de lister la journée", async () => {
    const seen: LlmCompletionRequest[] = [];

    await createBriefWriter(makeLlm("Bonjour Yann :", seen))(AUDIENCE, 5);

    expect(JSON.stringify(seen[0]?.messages)).toContain("Aime courir le matin");
    expect(seen[0]?.system).toContain("Ne cite AUCUNE heure");
  });

  it("lève une erreur quand le modèle est en panne", async () => {
    const write = createBriefWriter(makeLlm(new Error("panne")));

    await expect(write(AUDIENCE, 1)).rejects.toThrow("panne");
  });

  it("lève une erreur quand le modèle dépasse le délai", async () => {
    const slow: LlmProvider = {
      name: "test",
      isSovereign: true,
      model: "test/model",
      stream: () =>
        (async function* (): AsyncGenerator<LlmStreamChunk> {
          await new Promise((resolve) => setTimeout(resolve, 200));
          yield { type: "text", text: "Bonjour :" };
        })(),
    };

    await expect(createBriefWriter(slow, 20)(AUDIENCE, 1)).rejects.toThrow("délai dépassé");
  });
});

describe("acceptable", () => {
  it("refuse le vide, le multiligne et le démesuré", () => {
    expect(acceptable("")).toBe(false);
    expect(acceptable("Bonjour\nYann")).toBe(false);
    expect(acceptable("a".repeat(201))).toBe(false);
  });

  it("accepte une phrase sans heure", () => {
    expect(acceptable("Bonjour Yann, voici ta journée :")).toBe(true);
  });
});
