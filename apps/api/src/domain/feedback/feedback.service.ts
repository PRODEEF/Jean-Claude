import type {
  CreateFeedback,
  Feedback,
  FeedbackAnalysis,
  FeedbackAuthor,
  FeedbackStatus,
  MessageRating,
  RateMessage,
  TesterFeedback,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import type { LlmProvider } from "../../core/llm/llm.port.js";
import type {
  AuthoredFeedback,
  AuthoredRating,
  IFeedbackRepository,
} from "./feedback.repository.interface.js";

/**
 * Consigne de la synthèse d'un testeur.
 *
 * Elle s'adresse à l'équipe, pas au testeur : le registre est celui d'un
 * compte rendu, et le modèle ne doit rien ajouter que les retours ne disent.
 */
const ANALYSIS_PROMPT = [
  "Tu aides l'équipe qui développe Jean-Claude, un assistant d'organisation",
  "personnelle en bêta, à exploiter les retours d'un de ses testeurs. Tu reçois",
  "ses retours (bugs, idées, réclamations) avec leur statut de traitement, et",
  "ses notations des réponses de l'assistant.",
  "",
  "Rédige en français une synthèse courte, en Markdown, avec ces sections —",
  "omets celles qui seraient vides :",
  "## En bref — deux phrases sur l'expérience de ce testeur.",
  "## À traiter en priorité — les problèmes encore ouverts (statut « nouveau »",
  "ou « pris en compte »), du plus bloquant au moins bloquant. Regroupe ceux qui",
  "décrivent la même chose, et cite l'écran quand il éclaire le problème.",
  "## Idées et attentes — ce qu'il souhaite voir évoluer.",
  "## Déjà traité — une ligne, seulement si des retours sont traités ou écartés.",
  "",
  "Ne t'appuie que sur les retours fournis : n'invente ni cause technique ni",
  "détail qu'ils ne donnent pas.",
].join("\n");

const CATEGORY_LABELS: Record<Feedback["category"], string> = {
  bug: "Bug",
  idea: "Idée",
  other: "Réclamation ou autre",
};

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "nouveau",
  acknowledged: "pris en compte",
  resolved: "traité",
  dismissed: "écarté",
};

export class FeedbackService {
  constructor(
    private readonly feedback: IFeedbackRepository,
    private readonly llm: LlmProvider,
  ) {}

  async submitGeneral(
    userId: string,
    input: CreateFeedback,
    accessToken: string,
  ): Promise<Feedback> {
    return this.feedback.createGeneral(userId, input, accessToken);
  }

  async rateMessage(
    userId: string,
    messageId: string,
    input: RateMessage,
    accessToken: string,
  ): Promise<MessageRating> {
    return this.feedback.rateMessage(userId, messageId, input, accessToken);
  }

  /**
   * Retours de tous les testeurs, regroupés par personne, le plus récemment
   * actif en tête.
   *
   * La RLS rendrait à un non-admin ses seuls retours : le refus explicite
   * évite qu'il prenne cette liste pour la revue de l'équipe.
   */
  async listByTester(accessToken: string): Promise<TesterFeedback[]> {
    await this.requireAdmin(accessToken);

    const [feedback, ratings, authors] = await Promise.all([
      this.feedback.listFeedback(null, accessToken),
      this.feedback.listRatings(null, accessToken),
      this.feedback.listAuthors(accessToken),
    ]);

    return groupByTester(feedback, ratings, authors);
  }

  async updateStatus(id: string, status: FeedbackStatus, accessToken: string): Promise<Feedback> {
    await this.requireAdmin(accessToken);

    const updated = await this.feedback.updateStatus(id, status, accessToken);
    if (!updated) throw httpError(404, "Retour introuvable.");
    return updated;
  }

  /**
   * Synthèse des retours d'un testeur par le modèle, à la demande.
   *
   * Non conservée : elle se relit en quelques secondes, et une synthèse
   * stockée vieillirait dès le retour suivant.
   */
  async analyzeTester(testerId: string, accessToken: string): Promise<FeedbackAnalysis> {
    await this.requireAdmin(accessToken);

    const [feedback, ratings] = await Promise.all([
      this.feedback.listFeedback(testerId, accessToken),
      this.feedback.listRatings(testerId, accessToken),
    ]);

    if (feedback.length === 0 && ratings.length === 0) {
      throw httpError(404, "Aucun retour pour ce testeur.");
    }

    let summary = "";
    const stream = this.llm.stream({
      system: ANALYSIS_PROMPT,
      messages: [{ role: "user", content: describeForAnalysis(feedback, ratings) }],
    });

    for await (const chunk of stream) {
      if (chunk.type === "text") summary += chunk.text;
    }

    const trimmed = summary.trim();
    if (!trimmed) {
      throw httpError(503, "Le moteur IA n'a rien produit. Réessayez dans un instant.");
    }
    return { summary: trimmed };
  }

  private async requireAdmin(accessToken: string): Promise<void> {
    if (!(await this.feedback.isAdmin(accessToken))) {
      throw httpError(403, "Réservé à l'équipe Jean-Claude.");
    }
  }
}

/**
 * Regroupe retours et notations par testeur.
 *
 * Les listes arrivent déjà du plus récent au plus ancien, et le regroupement
 * préserve cet ordre. Un auteur absent de `authors` — compte supprimé entre
 * les deux lectures — garde ses retours, sans nom ni adresse.
 */
function groupByTester(
  feedback: AuthoredFeedback[],
  ratings: AuthoredRating[],
  authors: FeedbackAuthor[],
): TesterFeedback[] {
  const byId = new Map(authors.map((author) => [author.id, author]));
  const testers = new Map<string, TesterFeedback>();

  const entryFor = (userId: string, at: string): TesterFeedback => {
    let entry = testers.get(userId);
    if (!entry) {
      entry = {
        author: byId.get(userId) ?? { id: userId, displayName: null, email: null },
        feedback: [],
        ratings: [],
        lastActivityAt: at,
      };
      testers.set(userId, entry);
    }
    if (at > entry.lastActivityAt) entry.lastActivityAt = at;
    return entry;
  };

  for (const { userId, ...item } of feedback) {
    entryFor(userId, item.createdAt).feedback.push(item);
  }
  for (const { userId, ...item } of ratings) {
    entryFor(userId, item.createdAt).ratings.push(item);
  }

  return [...testers.values()].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

/**
 * Retours d'un testeur, mis en texte pour le modèle.
 *
 * Les notations sans commentaire ne disent rien d'autre que leur sens : elles
 * sont comptées plutôt qu'énumérées.
 */
function describeForAnalysis(feedback: AuthoredFeedback[], ratings: AuthoredRating[]): string {
  const lines: string[] = [];

  if (feedback.length > 0) {
    lines.push("Retours :");
    for (const item of feedback) {
      lines.push(
        `- [${CATEGORY_LABELS[item.category]}, ${STATUS_LABELS[item.status]}, ` +
          `${item.createdAt.slice(0, 10)}, ${item.platform}, écran ${item.screen}] ${item.content}`,
      );
    }
  }

  if (ratings.length > 0) {
    const up = ratings.filter((rating) => rating.rating === "up").length;
    const down = ratings.length - up;
    lines.push(
      "",
      `Notations des réponses de l'assistant : ${up} pouce(s) haut, ${down} pouce(s) bas.`,
    );

    for (const rating of ratings) {
      if (rating.comment === null) continue;
      const sense = rating.rating === "up" ? "Pouce haut" : "Pouce bas";
      lines.push(`- [${sense}, ${rating.createdAt.slice(0, 10)}] ${rating.comment}`);
    }
  }

  return lines.join("\n").trim();
}
