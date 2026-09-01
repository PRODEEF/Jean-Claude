import {
  createProjectFoldersPayloadSchema,
  type Suggestion,
  type SuggestionStatus,
} from "@jc/domain";
import { httpError } from "../../core/http";
import type { LlmToolCall } from "../../core/llm/llm.port";
import { SUGGEST_PROJECT_FOLDERS } from "../../core/llm/llm.tools";
import type { ISuggestionRepository } from "./suggestion.repository.interface";

/** Longueur maximale de `message`, alignée sur la contrainte CHECK de la table. */
const MESSAGE_MAX_LENGTH = 500;

export class SuggestionService {
  constructor(private readonly suggestions: ISuggestionRepository) {}

  /**
   * Traduit un appel d'outil du modèle en suggestion en attente (§12.1).
   *
   * Rien n'est exécuté ici : c'est précisément ce qui distingue « je te crée
   * ces dossiers ? » de « j'ai créé ces dossiers ». L'utilisateur accepte ou
   * ignore ensuite d'un geste.
   *
   * Un appel inexploitable rend `null` plutôt que de faire échouer le tour de
   * dialogue : la réponse du modèle reste lisible, seule la proposition est
   * perdue. Afficher une carte dont la charge utile ne peut pas être exécutée
   * serait pire — l'utilisateur cliquerait sur une action vouée à échouer.
   */
  async capture(
    userId: string,
    conversationId: string,
    toolCall: LlmToolCall,
    accessToken: string,
  ): Promise<Suggestion | null> {
    if (toolCall.name !== SUGGEST_PROJECT_FOLDERS.name) {
      console.warn(`Appel d'outil sans suggestion correspondante : ${toolCall.name}`);
      return null;
    }

    const raw = toolCall.input["message"];
    const message = typeof raw === "string" ? raw.trim() : "";
    const payload = createProjectFoldersPayloadSchema.safeParse(toolCall.input);

    if (message.length === 0 || message.length > MESSAGE_MAX_LENGTH || !payload.success) {
      console.warn("Appel d'outil `suggest_project_folders` inexploitable : suggestion ignorée.");
      return null;
    }

    return this.suggestions.create(
      userId,
      {
        conversationId,
        kind: "create_project_folders",
        message,
        payload: payload.data,
      },
      accessToken,
    );
  }

  listPending(conversationId: string, accessToken: string): Promise<Suggestion[]> {
    return this.suggestions.listPending(conversationId, accessToken);
  }

  /**
   * Suggestion encore en attente, ou l'échec correspondant.
   *
   * Le 409 couvre le double appui, courant sur mobile : la seconde acceptation
   * doit dire que la proposition est déjà traitée, pas créer les dossiers une
   * deuxième fois.
   */
  async requirePending(id: string, accessToken: string): Promise<Suggestion> {
    const suggestion = await this.suggestions.findById(id, accessToken);
    if (!suggestion) throw httpError(404, "Proposition introuvable.");
    if (suggestion.status !== "pending") {
      throw httpError(409, "Cette proposition a déjà été traitée.");
    }
    return suggestion;
  }

  async markResolved(
    id: string,
    status: SuggestionStatus,
    accessToken: string,
  ): Promise<Suggestion> {
    await this.requirePending(id, accessToken);
    return this.suggestions.markResolved(id, status, accessToken);
  }
}
