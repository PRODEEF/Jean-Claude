import type { MessageAttachment, MessageAttachmentMimeType } from "@jc/domain";

export type CreateAttachmentInput = {
  mimeType: MessageAttachmentMimeType;
  byteSize: number;
  fileName: string;
  /** Texte extrait d'un PDF côté Service — `null` pour une image. */
  extractedText: string | null;
  file: File;
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
export type AttachmentRecord = MessageAttachment & { messageId: string | null };

export interface IAttachmentRepository {
  create(userId: string, input: CreateAttachmentInput, accessToken: string): Promise<MessageAttachment>;
  findById(id: string, accessToken: string): Promise<AttachmentRecord | null>;
  findByIds(ids: string[], accessToken: string): Promise<AttachmentRecord[]>;
  /** N'affecte que les lignes encore `message_id is null` — garde-fou en plus de RLS. */
  linkToMessage(ids: string[], messageId: string, accessToken: string): Promise<void>;
  /** Supprime la ligne, puis best-effort l'objet Storage associé. */
  delete(id: string, accessToken: string): Promise<void>;
}
