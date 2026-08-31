import { z } from "zod";

/** Identifiant technique — UUID v4 généré par Postgres. */
export const uuidSchema = z.string().uuid();

/** Timestamp ISO 8601 en UTC. Toutes les dates transitent sous cette forme. */
export const isoDateTimeSchema = z.string().datetime({ offset: true });

/**
 * Couleur au format hexadécimal — utilisée pour la couleur de l'assistant
 * et les couleurs de dossier (§ paramètres, panneau de la maquette).
 */
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale attendue");

/** Libellé court saisi par l'utilisateur (titre de dossier, de tâche...). */
export const labelSchema = z.string().trim().min(1).max(120);

/** Pagination par curseur — stable même si des éléments sont insérés entre deux pages. */
export const cursorPaginationSchema = z.object({
  cursor: isoDateTimeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type CursorPagination = z.infer<typeof cursorPaginationSchema>;

/** Enveloppe de réponse paginée, identique pour toutes les collections de l'API. */
export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: isoDateTimeSchema.nullable(),
  });
}

export type Paginated<T> = {
  items: T[];
  nextCursor: string | null;
};
