import { z } from "zod";
import { hexColorSchema, isoDateTimeSchema, labelSchema, uuidSchema } from "../shared/primitives";

/**
 * Catégorie de regroupement des dossiers (A.0).
 *
 * Volontairement optionnelle : la V1 garde les dossiers à plat, sans distinction
 * visuelle Perso/Pro. Le champ existe dès maintenant pour que l'activation
 * ultérieure du regroupement ne demande pas de migration de schéma.
 */
export const folderCategorySchema = z.enum(["personal", "professional"]);
export type FolderCategory = z.infer<typeof folderCategorySchema>;

/**
 * Rôle sémantique d'un sous-dossier créé automatiquement pour un projet (A.4).
 * `generic` = dossier ordinaire créé par l'utilisateur.
 */
export const folderPurposeSchema = z.enum(["generic", "idea", "todo", "purchase", "appointment"]);
export type FolderPurpose = z.infer<typeof folderPurposeSchema>;

export const folderSchema = z.object({
  id: uuidSchema,
  name: labelSchema,
  /** `null` = dossier racine. L'arborescence est limitée à 2 niveaux en V1 (§3 Phase A). */
  parentId: uuidSchema.nullable(),
  category: folderCategorySchema.nullable(),
  purpose: folderPurposeSchema,
  color: hexColorSchema.nullable(),
  position: z.number().int().nonnegative(),
  /** Renseigné quand le dossier a été créé à l'initiative de l'assistant (A.4). */
  createdByAssistant: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type Folder = z.infer<typeof folderSchema>;

export const createFolderSchema = z.object({
  name: labelSchema,
  parentId: uuidSchema.nullable().optional(),
  category: folderCategorySchema.nullable().optional(),
  purpose: folderPurposeSchema.optional(),
  color: hexColorSchema.nullable().optional(),
});

export type CreateFolder = z.infer<typeof createFolderSchema>;

export const updateFolderSchema = createFolderSchema.partial().extend({
  position: z.number().int().nonnegative().optional(),
});

export type UpdateFolder = z.infer<typeof updateFolderSchema>;

/** Dossier enrichi de ses enfants — forme consommée par la sidebar (web) et le tiroir (mobile). */
export type FolderTreeNode = Folder & {
  children: Folder[];
  conversationCount: number;
};

/** Profondeur maximale de l'arborescence en V1 : Dossier > Sous-dossier > Conversation. */
export const MAX_FOLDER_DEPTH = 2;
