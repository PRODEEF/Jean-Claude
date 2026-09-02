import type { AssistantScope } from "@jc/domain";
import type { LlmTool } from "./llm.port.js";

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
      message: {
        type: "string",
        description:
          "Proposition adressée à l'utilisateur, à la première personne et sous forme " +
          "de question — ex. « On dirait qu'une liste d'achats et une liste de tâches " +
          "se dessinent pour le jardin, je te les organise ? ». Ne jamais présenter " +
          "les listes comme déjà créées. 500 caractères maximum.",
      },
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
        minItems: 1,
        maxItems: 4,
      },
    },
    required: ["message", "lists"],
  },
};

export const SUGGEST_FOLDERS: LlmTool = {
  name: "suggest_folders",
  description:
    "À appeler dès que l'échange en dit assez sur le sujet de la conversation pour " +
    "savoir où la ranger. Ne pas attendre qu'on le demande. " +
    "Une conversation peut légitimement appartenir à plusieurs dossiers à la fois " +
    "(une conversation sur la mutuelle relève à la fois de « Santé » et de " +
    "« Administratif > Assurances ») : proposer tous les dossiers pertinents, pas seulement un. " +
    "Réutiliser en priorité les dossiers existants listés dans la consigne, en recopiant " +
    "leur identifiant caractère pour caractère — un identifiant reconstitué de mémoire ou " +
    "remplacé par le nom du dossier fait perdre la ligne correspondante. " +
    "N'en proposer un nouveau que si aucun ne convient, et remplir au moins l'une des deux " +
    "listes : une proposition sans aucun dossier n'a rien à ranger. " +
    "S'aligner sur la façon dont l'utilisateur nomme déjà ses dossiers plutôt que d'imposer " +
    "une nomenclature standard.",
  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description:
          "Proposition adressée à l'utilisateur, à la première personne et sous forme " +
          "de question — ex. « Je range ça dans Santé et j'ouvre un dossier Assurances ? ». " +
          "Ne jamais présenter le rangement comme déjà fait. 500 caractères maximum.",
      },
      existingFolderIds: {
        type: "array",
        description: "Identifiants de dossiers existants, repris tels quels de la consigne.",
        maxItems: 8,
        items: { type: "string" },
      },
      newFolderNames: {
        type: "array",
        description: "Dossiers à créer, quand aucun dossier existant ne convient.",
        maxItems: 8,
        items: { type: "string" },
      },
    },
    required: ["message"],
  },
};

export const NAME_CONVERSATION: LlmTool = {
  name: "name_conversation",
  description:
    "À appeler une fois, dès le premier tour de dialogue, pour nommer la conversation. " +
    "Contrairement aux autres outils, celui-ci ne demande rien à l'utilisateur : le titre " +
    "s'applique aussitôt, et l'utilisateur pourra le corriger. " +
    "Ne pas y répondre en langage naturel, ne pas annoncer le renommage.",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description:
          "Titre court et descriptif, tiré du sujet réel de l'échange — 60 caractères " +
          "au plus, sans guillemets ni ponctuation finale. Ex. « Travaux du jardin ».",
      },
    },
    required: ["title"],
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

export const OPEN_NEW_CONVERSATION: LlmTool = {
  name: "open_new_conversation",
  description:
    "À appeler dès que la demande sort du périmètre du canal permanent, " +
    "c'est-à-dire tout ce qui n'est ni un rappel, ni l'organisation interne de " +
    "l'outil (dossiers, rangement, structure), ni la structure du projet de " +
    "l'utilisateur. Une recette, un itinéraire, une explication, une rédaction : " +
    "tout cela relève d'une conversation classique. " +
    "Ne pas traiter la demande soi-même : annoncer en une phrase l'ouverture de " +
    "la conversation dédiée, où la réponse sera donnée.",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description:
          "Titre de la conversation à ouvrir, tiré de la demande — court et " +
          "descriptif, 120 caractères maximum. Ex. « Itinéraire de 5 jours en Bretagne ».",
      },
    },
    required: ["title"],
  },
};

export const FINISH_ONBOARDING: LlmTool = {
  name: "finish_onboarding",
  description:
    "À appeler dès que la conversation d'accueil a appris l'essentiel sur l'utilisateur : " +
    "qui il est, où il en est côté professionnel et personnel, les projets ou les idées " +
    "qu'il a en tête. Trois ou quatre échanges suffisent — mieux vaut clore tôt que " +
    "transformer l'accueil en interrogatoire. " +
    "Comme `name_conversation`, cet outil ne demande rien à l'utilisateur : il enregistre " +
    "aussitôt. Ne pas l'annoncer, et poursuivre la conversation normalement.",
  inputSchema: {
    type: "object",
    properties: {
      memory: {
        type: "string",
        description:
          "Ce qu'il faut retenir durablement de l'utilisateur, rédigé à la troisième " +
          "personne, en quelques phrases : situation, activité, projets en cours, façon " +
          "de s'organiser. Uniquement ce qui sera encore vrai dans six mois — le détail " +
          "ponctuel appartient à la conversation, pas à la mémoire. " +
          "2000 caractères au plus.",
      },
    },
    required: ["memory"],
  },
};

export const ASK_QUESTION: LlmTool = {
  name: "ask_question",
  description:
    "À appeler en posant une question dont quelques réponses couvrent l'essentiel des " +
    "cas — « quel type de questions veux-tu ? », « on part sur quel angle ? ». " +
    "L'utilisateur répond alors d'un appui, sans avoir à écrire ; il garde de toute " +
    "façon la possibilité de répondre librement ou de passer. " +
    "Ne pas l'appeler pour une question ouverte, dont la réponse tient dans le récit " +
    "de l'utilisateur (« raconte-moi ce qui t'occupe ») : lui présenter quatre boutons " +
    "reviendrait à lui souffler sa réponse. Une seule question à la fois. " +
    "Comme `name_conversation`, cet outil ne demande rien : les réponses proposées " +
    "s'affichent aussitôt sous la question. Ne pas les énumérer une seconde fois dans " +
    "le texte de la réponse.",
  inputSchema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description:
          "La question posée, telle qu'elle sera affichée — courte et directe, " +
          "200 caractères au plus. À reprendre à l'identique si le texte de la " +
          "réponse la pose déjà.",
      },
      choices: {
        type: "array",
        description:
          "Réponses proposées, de la plus probable à la moins probable. " +
          "Deux au moins, six au plus — au-delà, la liste devient un formulaire.",
        minItems: 2,
        maxItems: 6,
        items: {
          type: "string",
          description: "Réponse en quelques mots, 80 caractères au plus.",
        },
      },
    },
    required: ["question", "choices"],
  },
};

/** Outils actifs sur une conversation classique. */
export const CHAT_TOOLS: LlmTool[] = [
  SUGGEST_TASK_LIST,
  SUGGEST_FOLDERS,
  SUGGEST_RECURRING_EVENT,
  ASK_QUESTION,
];

/**
 * Outils actifs sur le canal permanent Jean-Claude (A.10).
 *
 * Jeu distinct de `CHAT_TOOLS` : le canal est borné aux rappels, à
 * l'organisation de l'outil et à la structure du projet. Y exposer la détection
 * de todolistes ou de rendez-vous récurrents le ferait déborder de ce périmètre.
 */
export const ASSISTANT_TOOLS: LlmTool[] = [
  SUGGEST_PROJECT_FOLDERS,
  OPEN_NEW_CONVERSATION,
  ASK_QUESTION,
];

/**
 * Capacité de périmètre dont dépend chaque outil de suggestion (A.10).
 *
 * Les outils absents de cette table ne relèvent d'aucun réglage :
 * `name_conversation` ne fait que poser un libellé, `finish_onboarding` clôt
 * un accueil qui ne se produit qu'une fois, `ask_question` ne fait que donner
 * une forme à une question que le modèle poserait de toute façon, et
 * `open_new_conversation` applique le bornage du canal lui-même — le rendre
 * désactivable reviendrait à supprimer A.10.
 */
const SCOPE_BY_TOOL_NAME: Record<string, keyof AssistantScope> = {
  [SUGGEST_TASK_LIST.name]: "proactiveTaskDetection",
  [SUGGEST_RECURRING_EVENT.name]: "proactiveScheduling",
  [SUGGEST_FOLDERS.name]: "folderOrganization",
  [SUGGEST_PROJECT_FOLDERS.name]: "structureSuggestions",
};

/**
 * L'outil relève-t-il d'une capacité que l'utilisateur laisse active ?
 *
 * Sert deux fois : à retirer l'outil du jeu remis au modèle, et à écarter
 * l'appel s'il arrive quand même. Une capacité désactivée dans les réglages
 * n'est pas seulement masquée dans l'UI — le serveur refuse de produire la
 * suggestion correspondante, ce qui rend le réglage identique sur les quatre
 * plateformes.
 */
export function isAllowedByScope(toolName: string, scope: AssistantScope): boolean {
  const capability = SCOPE_BY_TOOL_NAME[toolName];
  return capability === undefined || scope[capability];
}
