import type { LlmProvider } from "../../core/llm/llm.port.js";
import { describeReminder, type ReminderMessageInput } from "./reminder-message.js";

/** Ce que le rédacteur sait de la personne : de quoi parler comme à quelqu'un qu'on connaît. */
export type ReminderAudience = {
  displayName: string | null;
  assistantName: string;
  /** Mémoire de l'utilisateur (accueil), `null` tant qu'il n'y en a pas. */
  memory: string | null;
};

/** Écrit un rappel ; lève une erreur quand il n'a rien de sûr à proposer. */
export type ReminderWriter = (
  input: ReminderMessageInput,
  audience: ReminderAudience,
) => Promise<string>;

/** Au-delà, ce n'est plus un rappel : on retombe sur la phrase fixe. */
const MAX_LENGTH = 320;
/** La mémoire d'un utilisateur peut être longue : seul le début éclaire un rappel. */
const MAX_MEMORY_CHARS = 1_500;
/** Le planificateur passe toutes les cinq minutes : un modèle lent ne doit pas le retenir. */
const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * Consigne du rédacteur de rappels (demande de Yann, 24 novembre : des rappels
 * « beaucoup plus humains »).
 *
 * Le modèle écrit la phrase, jamais les faits : l'heure et le titre sont ceux du
 * rendez-vous, et un message qui ne reprend pas l'heure exacte est refusé
 * (`acceptable`). Un rappel informe, il ne propose rien et ne modifie rien (§12.1).
 */
function systemPrompt(audience: ReminderAudience): string {
  const who = audience.displayName ? `de ${audience.displayName}` : "de la personne";
  return [
    `Tu es ${audience.assistantName}, l'assistant personnel ${who}. Tu écris UN petit`,
    "message de rappel, qui s'affichera dans votre conversation et par e-mail.",
    "",
    "Règles :",
    "- Tu tutoies. Une ou deux phrases courtes, 200 caractères au plus.",
    "- Chaleureux et naturel, comme un ami organisé : jamais administratif, jamais",
    "  « Rappel : ».",
    "- Dis clairement quoi, à quelle heure et dans combien de temps. Recopie l'heure",
    "  exactement comme elle t'est donnée (« 15h26 », pas « 15:26 »).",
    "- N'invente rien : ni lieu, ni personne, ni conseil, ni circonstance qui ne",
    "  figurent pas dans les informations ci-dessous.",
    "- Si ce que tu sais de la personne éclaire directement ce rappel, tu peux en",
    "  tenir compte discrètement ; sinon, n'en parle pas.",
    "- Varie ta façon de dire. Pas de liste, pas de Markdown, pas de guillemets",
    "  autour du message, un seul émoji au plus, et seulement s'il va avec.",
    "- Tu informes seulement : tu ne proposes aucune action.",
    "",
    "Réponds uniquement par le message.",
  ].join("\n");
}

function userPrompt(input: ReminderMessageInput, audience: ReminderAudience): string {
  const { day, clock, lead } = describeReminder(input);
  const lines = [`Ce dont il faut rappeler : ${input.title}`];

  if (clock === null) {
    lines.push(`Quand : ${day}, toute la journée.`);
  } else {
    lines.push(`Quand : ${day}, à ${clock}.`);
    lines.push(lead !== null ? `Dans : ${lead}.` : "C'est maintenant.");
  }

  const memory = audience.memory?.trim();
  if (memory)
    lines.push("", `Ce que tu sais de la personne :\n${memory.slice(0, MAX_MEMORY_CHARS)}`);
  return lines.join("\n");
}

/**
 * Le message est-il utilisable ? Un modèle peut oublier l'heure ou la déformer :
 * mieux vaut la phrase fixe qu'un rappel qui envoie la personne à la mauvaise heure.
 */
export function acceptable(text: string, input: ReminderMessageInput): boolean {
  if (text.length === 0 || text.length > MAX_LENGTH) return false;

  const { clock } = describeReminder(input);
  return clock === null || text.includes(clock);
}

/** Retire les guillemets qu'un modèle met parfois autour d'un message entier. */
function clean(raw: string): string {
  return raw
    .trim()
    .replace(/^["«»“”]+\s*/, "")
    .replace(/\s*["«»“”]+$/, "")
    .trim();
}

/**
 * Rédacteur de rappels branché sur le moteur IA.
 *
 * Le moteur n'est joint que par le port `LlmProvider` (invariant §5.1). Une
 * panne, un délai dépassé ou une phrase inutilisable lèvent une erreur : l'appelant
 * envoie alors la phrase fixe, le rappel part quoi qu'il arrive.
 */
export function createReminderWriter(
  llm: LlmProvider,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): ReminderWriter {
  return async (input, audience) => {
    const ask = async (): Promise<string> => {
      let text = "";
      const stream = llm.stream({
        system: systemPrompt(audience),
        messages: [{ role: "user", content: userPrompt(input, audience) }],
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
      const message = clean(await Promise.race([ask(), timeout]));
      if (!acceptable(message, input)) throw new Error("message inutilisable");
      return message;
    } finally {
      clearTimeout(timer);
    }
  };
}
