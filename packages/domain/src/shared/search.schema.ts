import { z } from "zod";
import { uuidSchema } from "./primitives";
import { conversationSchema } from "../conversation/conversation.schema";

/**
 * Raccourcis de plage de dates de la recherche (A.6).
 *
 * Résolus côté serveur et non côté client : le calcul dépend du fuseau de
 * l'utilisateur, et doit donner le même résultat sur web, mobile et desktop.
 */
export const dateShortcutSchema = z.enum([
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_year",
  "last_year",
]);

export type DateShortcut = z.infer<typeof dateShortcutSchema>;

/**
 * Date de calendrier, sans heure ni fuseau.
 *
 * Les bornes saisies par l'utilisateur ne sont pas des instants : « du 3 mars »
 * ne veut rien dire tant qu'on n'a pas dit dans quel fuseau. C'est le serveur
 * qui les transforme en instants, avec le fuseau du profil — même raison que
 * pour les raccourcis ci-dessus.
 */
export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue");

export const searchFiltersSchema = z.object({
  /** Recherche plein texte sur les titres et le contenu des messages. */
  query: z.string().trim().max(200).optional(),
  folderIds: z.array(uuidSchema).optional(),
  shortcut: dateShortcutSchema.optional(),
  /** Bornes inclusives. Ignorées si un raccourci est fourni. */
  from: calendarDateSchema.optional(),
  to: calendarDateSchema.optional(),
  includeArchived: z.boolean().default(false),
  limit: z.number().int().min(1).max(50).default(30),
});

export type SearchFilters = z.infer<typeof searchFiltersSchema>;

/**
 * Même chose, telle qu'elle transite dans la chaîne de requête.
 *
 * Une URL ne porte que des chaînes : les listes y sont jointes par des
 * virgules et les booléens s'y écrivent en toutes lettres. La conversion est
 * faite ici plutôt que dans la route, pour que le client et le serveur
 * s'accordent sur une seule définition du format.
 */
export const searchQuerySchema = searchFiltersSchema.extend({
  folderIds: z
    .string()
    .transform((value) => value.split(",").filter((id) => id.length > 0))
    .pipe(z.array(uuidSchema))
    .optional(),
  includeArchived: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

/**
 * Conversation trouvée, accompagnée du passage qui l'a fait remonter.
 *
 * L'extrait est ce qui distingue une recherche plein texte d'un filtre sur les
 * titres : sans lui, l'utilisateur ne sait pas *pourquoi* une conversation est
 * là. `null` quand la correspondance porte sur le titre seul.
 */
export const searchResultSchema = z.object({
  conversation: conversationSchema,
  excerpt: z.string().nullable(),
});

export type SearchResult = z.infer<typeof searchResultSchema>;
