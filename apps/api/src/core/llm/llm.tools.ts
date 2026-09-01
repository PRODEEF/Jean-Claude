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

const PURPOSE_VALUES = ["generic", "idea", "todo", "purchase", "appointment"];

/**
 * Un dossier proposé, à la racine ou en sous-dossier — même forme aux deux
 * niveaux. Fabriqué à chaque appel plutôt que partagé : le schéma est remis
 * au SDK du moteur, qui n'a pas à recevoir deux fois le même objet.
 */
function proposedFolderProperties(): Record<string, unknown> {
  return {
    name: { type: "string", description: "Nom du dossier, 120 caractères maximum" },
    purpose: {
      type: "string",
      enum: PURPOSE_VALUES,
      description:
        "Rôle du dossier : idea = IDÉE, todo = TODO, purchase = ACHAT, " +
        "appointment = PRENDRE RDV. Omettre pour un dossier ordinaire.",
    },
  };
}

export const SUGGEST_PROJECT_FOLDERS: LlmTool = {
  name: "suggest_project_folders",
  description:
    "À appeler pour proposer la création de nouveaux dossiers de rangement. " +
    "Ne pas confondre avec `suggest_folders`, qui range une conversation dans des " +
    "dossiers : celui-ci construit l'arborescence elle-même. " +
    "Un dossier peut porter des sous-dossiers, mais l'arborescence s'arrête là — " +
    "un sous-dossier ne peut pas en contenir d'autres. " +
    "Quand la conversation décrit un projet, les sous-dossiers types sont " +
    "IDÉE, TODO, ACHAT et PRENDRE RDV : renseigner alors `purpose`. " +
    "Reprendre les mots de l'utilisateur pour nommer les dossiers plutôt " +
    "qu'imposer une nomenclature standard.",
  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description:
          "Proposition adressée à l'utilisateur, à la première personne et sous forme " +
          "de question — ex. « Je te crée un dossier Jardin avec IDÉE, TODO et ACHAT " +
          "dedans ? ». Ne jamais présenter les dossiers comme déjà créés. " +
          "500 caractères maximum.",
      },
      folders: {
        type: "array",
        description: "Au moins un dossier — une proposition vide n'a rien à créer.",
        minItems: 1,
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            ...proposedFolderProperties(),
            children: {
              type: "array",
              description: "Sous-dossiers de ce dossier. Eux-mêmes sans enfants.",
              maxItems: 8,
              items: {
                type: "object",
                properties: proposedFolderProperties(),
                required: ["name"],
              },
            },
          },
          required: ["name"],
        },
      },
    },
    required: ["message", "folders"],
  },
};

/** Outils actifs sur une conversation classique. */
export const CHAT_TOOLS: LlmTool[] = [SUGGEST_TASK_LIST, SUGGEST_FOLDERS, SUGGEST_RECURRING_EVENT];

/**
 * Outils actifs sur le canal permanent Jean-Claude (A.10).
 *
 * Jeu distinct de `CHAT_TOOLS` : le canal est borné aux rappels, à
 * l'organisation de l'outil et à la structure du projet. Y exposer la détection
 * de todolistes ou de rendez-vous récurrents le ferait déborder de ce périmètre.
 */
export const ASSISTANT_TOOLS: LlmTool[] = [SUGGEST_PROJECT_FOLDERS];
