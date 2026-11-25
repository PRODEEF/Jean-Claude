import type { LlmCompletionRequest, LlmProvider, LlmStreamChunk } from "../../core/llm/llm.port.js";
import type { ReminderMessageInput } from "./reminder-message.js";
import { acceptable, createReminderWriter, type ReminderAudience } from "./reminder-writer.js";

const INPUT: ReminderMessageInput = {
  title: "Kiné",
  startsAt: "2026-11-12T18:26:00.000Z",
  allDay: false,
  reminderMinutesBefore: 10,
  timezone: "Europe/Paris",
};

const AUDIENCE: ReminderAudience = {
  displayName: "Yann",
  assistantName: "Jean-Claude",
  memory: "Aime courir le matin. Déteste les réunions tard.",
};

/** Moteur factice : rend le texte donné, et garde ce qu'on lui a demandé. */
function makeLlm(reply: string | Error, seen: LlmCompletionRequest[] = []): LlmProvider {
  return {
    name: "test",
    isSovereign: true,
    model: "test/model",
    stream: (request) => {
      seen.push(request);
      return (async function* (): AsyncGenerator<LlmStreamChunk> {
        if (reply instanceof Error) throw reply;
        yield { type: "text", text: reply.slice(0, 5) };
        yield { type: "text", text: reply.slice(5) };
      })();
    },
  };
}

describe("createReminderWriter", () => {
  it("rend la phrase du modèle quand elle reprend l'heure exacte", async () => {
    const write = createReminderWriter(makeLlm("Coucou Yann, ton kiné, c'est à 19h26 !"));

    await expect(write(INPUT, AUDIENCE)).resolves.toBe("Coucou Yann, ton kiné, c'est à 19h26 !");
  });

  it("retire les guillemets que le modèle met autour du message", async () => {
    const write = createReminderWriter(makeLlm("« Ton kiné, c'est à 19h26. »"));

    await expect(write(INPUT, AUDIENCE)).resolves.toBe("Ton kiné, c'est à 19h26.");
  });

  it("refuse une phrase qui oublie ou déforme l'heure", async () => {
    const write = createReminderWriter(makeLlm("Ton kiné approche, file !"));

    await expect(write(INPUT, AUDIENCE)).rejects.toThrow("inutilisable");
  });

  it("refuse une phrase démesurée", async () => {
    const write = createReminderWriter(makeLlm(`19h26 ${"blabla ".repeat(80)}`));

    await expect(write(INPUT, AUDIENCE)).rejects.toThrow("inutilisable");
  });

  it("refuse un message vide", async () => {
    const write = createReminderWriter(makeLlm("   "));

    await expect(write(INPUT, AUDIENCE)).rejects.toThrow("inutilisable");
  });

  it("laisse remonter une panne du moteur, pour que le rappel parte en phrase fixe", async () => {
    const write = createReminderWriter(makeLlm(new Error("moteur injoignable")));

    await expect(write(INPUT, AUDIENCE)).rejects.toThrow("moteur injoignable");
  });

  it("abandonne quand le moteur est trop lent", async () => {
    const slow: LlmProvider = {
      name: "slow",
      isSovereign: true,
      model: "test/slow",
      stream: () =>
        (async function* (): AsyncGenerator<LlmStreamChunk> {
          await new Promise((resolve) => setTimeout(resolve, 200));
          yield { type: "text", text: "19h26" };
        })(),
    };

    await expect(createReminderWriter(slow, 20)(INPUT, AUDIENCE)).rejects.toThrow("délai");
  });

  it("donne au modèle le titre, l'heure, l'avance et ce qu'on sait de la personne", async () => {
    const seen: LlmCompletionRequest[] = [];
    await createReminderWriter(makeLlm("Ton kiné, 19h26 !", seen))(INPUT, AUDIENCE);

    const content = String(seen[0]?.messages[0]?.content);
    expect(content).toContain("Kiné");
    expect(content).toContain("19h26");
    expect(content).toContain("10 minutes");
    expect(content).toContain("Aime courir le matin");
    expect(seen[0]?.system).toContain("tutoies");
    expect(seen[0]?.system).toContain("Jean-Claude");
  });

  it("ne parle pas de mémoire quand il n'y en a pas", async () => {
    const seen: LlmCompletionRequest[] = [];
    await createReminderWriter(makeLlm("Ton kiné, 19h26 !", seen))(INPUT, {
      ...AUDIENCE,
      memory: null,
    });

    expect(String(seen[0]?.messages[0]?.content)).not.toContain("Ce que tu sais");
  });

  it("borne la mémoire envoyée au modèle", async () => {
    const seen: LlmCompletionRequest[] = [];
    await createReminderWriter(makeLlm("Ton kiné, 19h26 !", seen))(INPUT, {
      ...AUDIENCE,
      memory: "x".repeat(5_000),
    });

    expect(String(seen[0]?.messages[0]?.content).length).toBeLessThan(1_800);
  });
});

describe("acceptable", () => {
  it("n'exige pas d'heure pour un rappel de journée entière", () => {
    expect(acceptable("C'est ta journée kiné, demain !", { ...INPUT, allDay: true })).toBe(true);
  });
});
