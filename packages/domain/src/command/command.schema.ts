/**
 * Commandes slash de l'input (§ raccourcis, à la manière des skills de
 * Claude Code) : un préfixe tapé en tête du message qui déclenche un
 * comportement dédié plutôt qu'un tour de dialogue ordinaire.
 *
 * Le catalogue est partagé entre l'app, qui l'affiche dans le menu
 * d'autocomplétion posé à la frappe de « / », et l'API, qui reconnaît le
 * même préfixe pour adapter la consigne système ou court-circuiter le
 * modèle. Un seul endroit à mettre à jour pour ajouter une commande.
 */

/**
 * Un nom par outil de suggestion déjà exposé au modèle (`core/llm/llm.tools.ts`),
 * plus /help : la commande ne fait rien qu'un outil ne fasse déjà, elle
 * force juste sa prise en compte immédiate plutôt que d'attendre que le
 * modèle la déduise seul de la conversation.
 */
export const SLASH_COMMAND_NAMES = ["todo", "dossier", "projet", "bug", "help"] as const;
export type SlashCommandName = (typeof SLASH_COMMAND_NAMES)[number];

export type SlashCommandDefinition = {
  name: SlashCommandName;
  /** Forme complète, affichée dans le menu d'autocomplétion et dans l'aide. */
  usage: string;
  /** Description courte, affichée sous la commande dans le menu d'autocomplétion. */
  description: string;
};

export const SLASH_COMMANDS: readonly SlashCommandDefinition[] = [
  {
    name: "todo",
    usage: "/todo <titre> [échéance]",
    description: "Crée une todoliste et aide à la remplir",
  },
  {
    name: "dossier",
    usage: "/dossier [dossier visé]",
    description: "Range cette conversation dans un dossier",
  },
  {
    name: "projet",
    usage: "/projet <nom>",
    description: "Structure un projet en sous-dossiers",
  },
  {
    name: "bug",
    usage: "/bug <description>",
    description: "Signale un problème technique",
  },
  {
    name: "help",
    usage: "/help",
    description: "Explique comment utiliser Jean-Claude",
  },
];

export type SlashCommand = { name: SlashCommandName; args: string };

const COMMAND_PATTERN = /^\/([a-z]+)\s*([\s\S]*)$/i;

/**
 * Reconnaît une commande slash en tête de message.
 *
 * Une commande inconnue (« /xyz... ») rend `null` plutôt que d'échouer : le
 * message reste alors un texte ordinaire, exactement comme s'il ne
 * commençait pas par une barre — c'est ce qui permet d'en ajouter sans
 * jamais casser un message qui commencerait par hasard de la même façon.
 */
export function parseSlashCommand(content: string): SlashCommand | null {
  const match = COMMAND_PATTERN.exec(content.trim());
  if (!match) return null;

  const name = match[1]?.toLowerCase();
  const known = SLASH_COMMANDS.find((command) => command.name === name);
  if (!known) return null;

  return { name: known.name, args: (match[2] ?? "").trim() };
}
