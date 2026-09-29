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
 * Consigne de la synthèse des nouveaux retours.
 *
 * Elle s'adresse à l'équipe, pas aux testeurs : le registre est celui d'un
 * compte rendu, et le modèle ne doit rien ajouter que les retours ne disent.
 */
const ANALYSIS_PROMPT = [
  "Tu aides l'équipe qui développe Jean-Claude, un assistant d'organisation",
  "personnelle en bêta, à traiter les nouveaux retours de ses testeurs : bugs,",
  "idées et réclamations que personne n'a encore pris en compte. Chaque testeur",
  "est désigné par un numéro.",
  "",
  "Rédige en français une synthèse courte, en Markdown, avec ces sections —",
  "omets celles qui seraient vides :",
  "## En bref — deux phrases sur ce qui ressort.",
  "## Problèmes à traiter en priorité — du plus bloquant au moins bloquant.",
  "Regroupe les retours qui décrivent la même chose, indique combien de testeurs",
  "sont concernés, et cite l'écran quand il éclaire le problème.",
  "## Idées et attentes — ce que les testeurs souhaitent voir évoluer, regroupé",
  "de même.",
  "## Réclamations — les mécontentements qui ne relèvent ni d'un bug ni d'une idée.",
  "",
  "Ne t'appuie que sur les retours fournis : n'invente ni cause technique ni",
  "détail qu'ils ne donnent pas.",
].join("\n");

const CATEGORY_LABELS: Record<Feedback["category"], string> = {
  bug: "Bug",
  idea: "Idée",
  other: "Réclamation ou autre",
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
      this.feedback.listFeedback(accessToken),
      this.feedback.listRatings(accessToken),
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
   * Synthèse par le modèle des retours encore au statut « nouveau », tous
   * testeurs confondus — ce qui attend que l'équipe s'en saisisse.
   *
   * Non conservée : elle se relit en quelques secondes, et une synthèse
   * stockée vieillirait dès le retour suivant. Les notations n'y entrent pas :
   * elles n'ont pas de statut, rien n'y distingue le neuf du déjà vu.
   */
  async analyzeNew(accessToken: string): Promise<FeedbackAnalysis> {
    await this.requireAdmin(accessToken);

    const fresh = (await this.feedback.listFeedback(accessToken)).filter(
      (item) => item.status === "new",
    );

    if (fresh.length === 0) {
      throw httpError(404, "Aucun nouveau retour à analyser.");
    }

    let summary = "";
    const stream = this.llm.stream({
      system: ANALYSIS_PROMPT,
      messages: [{ role: "user", content: describeForAnalysis(fresh) }],
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
 * Nouveaux retours, mis en texte pour le modèle.
 *
 * Chaque testeur y est un numéro, dans l'ordre d'apparition : assez pour
 * compter qui est concerné par un même problème, sans remettre au modèle ni
 * nom ni adresse (§8).
 */
function describeForAnalysis(feedback: AuthoredFeedback[]): string {
  const testers = new Map<string, number>();

  return feedback
    .map((item) => {
      const tester = testers.get(item.userId) ?? testers.size + 1;
      testers.set(item.userId, tester);

      return (
        `- [Testeur ${tester}, ${CATEGORY_LABELS[item.category]}, ` +
        `${item.createdAt.slice(0, 10)}, ${item.platform}, écran ${item.screen}] ${item.content}`
      );
    })
    .join("\n");
}
