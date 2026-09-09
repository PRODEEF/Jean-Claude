import { MESSAGE_ATTACHMENT_MAX_BYTES, messageAttachmentMimeTypeSchema, type MessageAttachment } from "@jc/domain";
import { httpError } from "../../core/http.js";
import type { IAttachmentRepository } from "./attachment.repository.interface.js";

export class AttachmentService {
  constructor(private readonly attachments: IAttachmentRepository) {}

  async upload(userId: string, file: File, accessToken: string): Promise<MessageAttachment> {
    const mimeType = messageAttachmentMimeTypeSchema.safeParse(file.type);
    if (!mimeType.success) {
      throw httpError(400, "Format d'image non pris en charge. Utilisez JPEG, PNG ou WebP.");
    }

    if (file.size <= 0) throw httpError(400, "Fichier vide.");
    if (file.size > MESSAGE_ATTACHMENT_MAX_BYTES) {
      throw httpError(413, "Image trop lourde : 10 Mo maximum.");
    }

    return this.attachments.create(
      userId,
      { mimeType: mimeType.data, byteSize: file.size, file },
      accessToken,
    );
  }

  /** Retire une pièce jointe pas encore envoyée — le trombone permet de revenir dessus avant l'envoi. */
  async remove(id: string, accessToken: string): Promise<void> {
    const attachment = await this.attachments.findById(id, accessToken);
    if (!attachment) throw httpError(404, "Pièce jointe introuvable.");

    if (attachment.messageId !== null) {
      throw httpError(409, "Cette pièce jointe fait déjà partie d'un message envoyé.");
    }

    await this.attachments.delete(id, accessToken);
  }
}
