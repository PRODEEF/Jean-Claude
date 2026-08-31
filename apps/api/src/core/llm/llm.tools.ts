import type { LlmTool } from "./llm.port";

/**
 * Outils exposés au modèle pour produire des suggestions structurées (§12.1).
 *
 * Le modèle n'exécute jamais ces actions : un appel d'outil devient une
 * suggestion en attente, que l'utilisateur accepte ou ignore d'un geste.
 * Le nommage et les descriptions sont rédigés en français car ils sont lus
 * par le modèle au même titre que le prompt.
 */
export const SUGGEST_TASK_LIST: LlmTool = {
  name: "suggest_task_list",
  description:
    "À appeler quand la conversation fait émerger une ou plusieurs listes actionnables. " +
    "Créer une entrée par liste distincte : une conversation sur des travaux de jardin " +
    "produit typiquement une liste d'achats ET une liste de tâches, qui ne doivent pas " +
    "être fusionnées.",
  inputSchema: {
    type: "object",
    properties: {
      lists: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Titre court de la liste" },
            kind: {
              type: "string",
              enum: ["todo", "shopping"],
              description: "todo = tâches à faire, shopping = achats à prévoir",
            },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  dueAt: {
                    type: "string",
                    description:
                      "Échéance ISO 8601 si une date est mentionnée ou déductible " +
                      "(« lundi prochain », « dans deux semaines »), sinon omettre.",
                  },
                },
                required: ["title"],
              },
            },
          },
          required: ["title", "kind", "items"],
        },
      },
    },
    required: ["lists"],
  },
};

export const SUGGEST_FOLDERS: LlmTool = {
  name: "suggest_folders",
  description:
    "À appeler pour proposer le rangement de la conversation dans un ou plusieurs dossiers. " +
    "Une conversation peut légitimement appartenir à plusieurs dossiers à la fois " +
    "(une conversation sur la mutuelle relève à la fois de « Santé » et de " +
    "« Administratif > Assurances ») : proposer tous les dossiers pertinents, pas seulement un. " +
    "S'aligner sur la façon dont l'utilisateur nomme déjà ses dossiers plutôt que d'imposer " +
    "une nomenclature standard.",
  inputSchema: {
    type: "object",
    properties: {
      existingFolderIds: { type: "array", items: { type: "string" } },
      newFolderNames: { type: "array", items: { type: "string" } },
    },
  },
};

export const SUGGEST_RECURRING_EVENT: LlmTool = {
  name: "suggest_recurring_event",
  description:
    "À appeler quand l'utilisateur mentionne un rendez-vous récurrent " +
    "(« j'ai kiné tous les mardis à 18h »). Produire une règle RRULE (RFC 5545) " +
    "plutôt qu'une liste de dates, pour que la série n'ait pas à être ressaisie.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      startsAt: { type: "string", description: "Première occurrence, ISO 8601" },
      rrule: { type: "string", description: "Ex. FREQ=WEEKLY;BYDAY=TU" },
      reminderMinutesBefore: { type: "number" },
    },
    required: ["title", "startsAt", "rrule"],
  },
};

/** Outils actifs sur une conversation classique. */
export const CHAT_TOOLS: LlmTool[] = [SUGGEST_TASK_LIST, SUGGEST_FOLDERS, SUGGEST_RECURRING_EVENT];
