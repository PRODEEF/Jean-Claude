import {
  addTaskListItemsPayloadSchema,
  assignFoldersPayloadSchema,
  createProjectFoldersPayloadSchema,
  createTaskListsPayloadSchema,
  uuidSchema,
  type Suggestion,
  type SuggestionKind,
  type SuggestionStatus,
} from "@jc/domain";
import { httpError } from "../../core/http.js";
import type { LlmToolCall } from "../../core/llm/llm.port.js";
import {
  SUGGEST_FOLDERS,
  SUGGEST_PROJECT_FOLDERS,
  SUGGEST_TASK_LIST,
  SUGGEST_TASK_LIST_ITEMS,
} from "../../core/llm/llm.tools.js";
import type { ISuggestionRepository } from "./suggestion.repository.interface.js";

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
    const translated = translate(toolCall);
    if (!translated) return null;

    const raw = toolCall.input["message"];
    const message = typeof raw === "string" ? raw.trim() : "";

    if (message.length === 0 || message.length > MESSAGE_MAX_LENGTH) {
      console.warn(`Appel d'outil \`${toolCall.name}\` sans phrase à afficher : ignoré.`);
      return null;
    }

    return this.suggestions.create(
      userId,
      { conversationId, kind: translated.kind, message, payload: translated.payload },
      accessToken,
    );
  }

  /**
   * Proposition formulée par le serveur, sans passer par le modèle (§12.1).
   *
   * Sert le second temps de la détection : une fois les todolistes créées, les
   * tâches datées sont connues et proposer de leur poser un créneau ne demande
   * plus d'interpréter quoi que ce soit. Un aller-retour de plus avec le moteur
   * n'ajouterait qu'une latence et le risque qu'il réponde autre chose qu'une
   * question. La règle, elle, ne bouge pas : c'est une proposition en attente,
   * pas une action.
   */
  propose(
    userId: string,
    conversationId: string,
    input: { kind: SuggestionKind; message: string; payload: Record<string, unknown> },
    accessToken: string,
  ): Promise<Suggestion> {
    return this.suggestions.create(userId, { conversationId, ...input }, accessToken);
  }

  listPending(conversationId: string, accessToken: string): Promise<Suggestion[]> {
    return this.suggestions.listPending(conversationId, accessToken);
  }

  listForConversation(conversationId: string, accessToken: string): Promise<Suggestion[]> {
    return this.suggestions.listForConversation(conversationId, accessToken);
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
    payload?: Record<string, unknown>,
  ): Promise<Suggestion> {
    await this.requirePending(id, accessToken);

    // La charge utile n'est réécrite que si l'acceptation l'a restreinte :
    // partout ailleurs, la proposition doit rester telle qu'elle a été
    // formulée.
    return payload
      ? this.suggestions.markResolved(id, status, accessToken, payload)
      : this.suggestions.markResolved(id, status, accessToken);
  }
}

/**
 * Nature de la proposition portée par un appel d'outil, et sa charge utile
 * validée.
 *
 * Un outil dont la charge utile ne passe pas son schéma est abandonné plutôt
 * que persisté : afficher une carte dont l'action échouerait à coup sûr serait
 * pire que de perdre la proposition.
 */
function translate(
  toolCall: LlmToolCall,
): { kind: SuggestionKind; payload: Record<string, unknown> } | null {
  if (toolCall.name === SUGGEST_PROJECT_FOLDERS.name) {
    const payload = createProjectFoldersPayloadSchema.safeParse(toolCall.input);
    if (payload.success) return { kind: "create_project_folders", payload: payload.data };
  } else if (toolCall.name === SUGGEST_FOLDERS.name) {
    const payload = assignFoldersPayloadSchema.safeParse(withUuidFolderIds(toolCall.input));
    if (payload.success) return { kind: "assign_folders", payload: payload.data };
  } else if (toolCall.name === SUGGEST_TASK_LIST.name) {
    const payload = createTaskListsPayloadSchema.safeParse(toolCall.input);
    if (payload.success) return { kind: "create_task_list", payload: payload.data };
  } else if (toolCall.name === SUGGEST_TASK_LIST_ITEMS.name) {
    const payload = addTaskListItemsPayloadSchema.safeParse(toolCall.input);
    if (payload.success) return { kind: "add_task_list_items", payload: payload.data };
  } else {
    console.warn(`Appel d'outil sans suggestion correspondante : ${toolCall.name}`);
    return null;
  }

  console.warn(`Appel d'outil \`${toolCall.name}\` inexploitable : suggestion ignorée.`);
  return null;
}

/**
 * Écarte les identifiants de dossier qui ne sont pas des UUID.
 *
 * Le modèle reprend parfois le nom d'un dossier là où la consigne demandait son
 * identifiant. Sans ce filtre, une seule valeur inventée fait échouer la
 * validation de la charge entière et la proposition est perdue — alors que
 * l'acceptation, elle, sait déjà passer outre un dossier qu'elle ne retrouve
 * pas. Écarter la ligne fautive plutôt que le rangement tout entier.
 *
 * Si le filtre ne laisse rien et qu'aucun nouveau dossier n'est proposé, le
 * schéma échoue à son tour : une proposition sans dossier n'aurait rien à
 * appliquer.
 */
function withUuidFolderIds(input: Record<string, unknown>): Record<string, unknown> {
  const ids = input["existingFolderIds"];
  if (!Array.isArray(ids)) return input;

  const kept = ids.filter((id) => uuidSchema.safeParse(id).success);
  if (kept.length < ids.length) {
    console.warn("Identifiants de dossier inexploitables écartés du rangement proposé.");
  }

  return { ...input, existingFolderIds: kept };
}
