import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./primitives";

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

export const searchFiltersSchema = z.object({
  /** Recherche plein texte sur les titres et le contenu des messages. */
  query: z.string().trim().max(200).optional(),
  folderIds: z.array(uuidSchema).optional(),
  kind: z.enum(["chat", "assistant"]).optional(),
  shortcut: dateShortcutSchema.optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  includeArchived: z.boolean().default(false),
});

export type SearchFilters = z.infer<typeof searchFiltersSchema>;
