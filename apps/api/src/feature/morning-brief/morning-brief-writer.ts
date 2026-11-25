import type { LlmProvider } from "../../core/llm/llm.port.js";

/** Ce que l'écrivain sait de la personne : de quoi lui parler comme à quelqu'un qu'on connaît. */
export type BriefAudience = {
  displayName: string | null;
  assistantName: string;
  memory: string | null;
};

/** Écrit l'introduction du point du matin ; lève une erreur quand il n'a rien de sûr. */
export type BriefWriter = (audience: BriefAudience, itemCount: number) => Promise<string>;

const MAX_LENGTH = 200;
const MAX_MEMORY_CHARS = 1_500;
const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * Consigne du rédacteur : une seule phrase d'accueil. Le modèle n'écrit jamais
 * la journée elle-même — elle est ajoutée telle quelle sous sa phrase, pour
 * qu'aucune heure ni aucun rendez-vous ne puisse être inventé.
 */
function systemPrompt(audience: BriefAudience): string {
  const who = audience.displayName ? `de ${audience.displayName}` : "de la personne";
  return [
    `Tu es ${audience.assistantName}, l'assistant personnel ${who}. Tu écris la phrase`,
    "d'accueil du point du matin, juste avant la liste de sa journée.",
    "",
    "Règles :",
    "- Tu tutoies. UNE phrase courte, 150 caractères au plus, sans retour à la ligne.",
    "- Chaleureux et naturel, comme un ami organisé. Termine par « : » ou « … »",
    "  puisque la liste suit.",
    "- Ne cite AUCUNE heure ni aucun rendez-vous : la liste vient juste après.",
    "- N'invente rien. Si ce que tu sais de la personne éclaire directement sa",
    "  matinée (sport, routine), tu peux y faire un clin d'œil discret ; sinon non.",
    "- Pas de Markdown, pas de guillemets autour de la phrase, un émoji au plus.",
    "",
    "Réponds uniquement par la phrase.",
  ].join("\n");
}

function userPrompt(audience: BriefAudience, itemCount: number): string {
  const lines = [itemCount <= 2 ? "La journée est plutôt légère." : "La journée est bien remplie."];
  const memory = audience.memory?.trim();
  if (memory)
    lines.push("", `Ce que tu sais de la personne :\n${memory.slice(0, MAX_MEMORY_CHARS)}`);
  return lines.join("\n");
}

/** Phrase utilisable : courte, d'une ligne, sans heure qui contredirait la liste. */
export function acceptable(text: string): boolean {
  if (text.length === 0 || text.length > MAX_LENGTH) return false;
  if (text.includes("\n")) return false;
  return !/\d\s*(h|:)\s*\d{0,2}/i.test(text);
}

function clean(raw: string): string {
  return raw
    .trim()
    .replace(/^["«»“”]+\s*/, "")
    .replace(/\s*["«»“”]+$/, "")
    .trim();
}

/**
 * Rédacteur branché sur le moteur IA, par le port `LlmProvider` (invariant §5.1).
 * Panne, délai ou phrase inutilisable lèvent une erreur : l'appelant envoie alors
 * l'introduction fixe, le point part quoi qu'il arrive.
 */
export function createBriefWriter(
  llm: LlmProvider,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): BriefWriter {
  return async (audience, itemCount) => {
    const ask = async (): Promise<string> => {
      let text = "";
      const stream = llm.stream({
        system: systemPrompt(audience),
        messages: [{ role: "user", content: userPrompt(audience, itemCount) }],
      });
      for await (const chunk of stream) {
        if (chunk.type === "text") text += chunk.text;
      }
      return text;
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("délai dépassé")), timeoutMs);
    });

    try {
      const greeting = clean(await Promise.race([ask(), timeout]));
      if (!acceptable(greeting)) throw new Error("phrase inutilisable");
      return greeting;
    } finally {
      clearTimeout(timer);
    }
  };
}
