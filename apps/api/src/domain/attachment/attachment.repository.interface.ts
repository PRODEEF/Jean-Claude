import type {
  MessageAttachment,
  MessageAttachmentMimeType,
  Paginated,
  WorkspaceRole,
} from "@jc/domain";

export type CreateAttachmentInput = {
  mimeType: MessageAttachmentMimeType;
  byteSize: number;
  fileName: string;
  /** Texte extrait d'un PDF côté Service — `null` pour une image. */
  extractedText: string | null;
  file: File;
  /** Espace où le fichier est déposé ; `null` pour le fil personnel. */
  workspaceId: string | null;
};

/**
 * Pièce jointe telle que la manipulent Repository et Service.
 *
 * `messageId` n'appartient pas à `MessageAttachment` (forme publique de
 * `@jc/domain`) : le client ne le lit jamais, il voit une pièce jointe soit
 * fraîchement uploadée (implicitement en attente), soit déjà posée dans un
 * message. Seuls le Service et le domaine `conversation` ont besoin de
 * distinguer les deux états — pour refuser une suppression ou une double
 * liaison.
 */
export type AttachmentRecord = MessageAttachment & {
  messageId: string | null;
  /** Auteur du dépôt. */
  userId: string;
  /** `null` pour une pièce du fil personnel. */
  workspaceId: string | null;
  /** Pièce d'espace supprimée : ni objet Storage ni texte. */
  deletedAt: string | null;
};

/** Fichier d'espace tel que le lit la page « Fichiers », avant le droit de suppression. */
export type WorkspaceFileRecord = {
  id: string;
  url: string;
  fileName: string;
  mimeType: MessageAttachmentMimeType;
  byteSize: number;
  authorId: string;
  groupId: string;
  groupTitle: string;
  createdAt: string;
};

export interface IAttachmentRepository {
  create(
    userId: string,
    input: CreateAttachmentInput,
    accessToken: string,
  ): Promise<MessageAttachment>;
  findById(id: string, accessToken: string): Promise<AttachmentRecord | null>;
  findByIds(ids: string[], accessToken: string): Promise<AttachmentRecord[]>;
  /** N'affecte que les lignes encore `message_id is null` — garde-fou en plus de RLS. */
  linkToMessage(ids: string[], messageId: string, accessToken: string): Promise<void>;
  /** Supprime la ligne, puis best-effort l'objet Storage associé. */
  delete(id: string, accessToken: string): Promise<void>;
  /**
   * Supprime une pièce d'espace déjà envoyée : la ligne reste, sans texte, pour
   * que le message dise « Fichier supprimé » ; l'objet Storage est effacé.
   */
  softDelete(id: string, accessToken: string): Promise<void>;
  /** Rôle de `userId` dans l'espace, `null` s'il n'en est pas membre. */
  findWorkspaceRole(
    workspaceId: string,
    userId: string,
    accessToken: string,
  ): Promise<WorkspaceRole | null>;
  /**
   * Fichiers envoyés et non supprimés de l'espace, du plus récent au plus
   * ancien, limités par la RLS aux conversations dont l'appelant est membre.
   */
  findWorkspaceFiles(
    workspaceId: string,
    options: { folderId?: string; cursor?: string; limit: number },
    accessToken: string,
  ): Promise<Paginated<WorkspaceFileRecord>>;
}
