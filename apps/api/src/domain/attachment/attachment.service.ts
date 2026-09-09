import { MESSAGE_ATTACHMENT_MAX_BYTES, messageAttachmentMimeTypeSchema, type MessageAttachment } from "@jc/domain";
import { extractPdfText } from "../../core/pdf-text.js";
import { httpError } from "../../core/http.js";
import type { IAttachmentRepository } from "./attachment.repository.interface.js";

export class AttachmentService {
  constructor(private readonly attachments: IAttachmentRepository) {}

  async upload(userId: string, file: File, accessToken: string): Promise<MessageAttachment> {
    const mimeType = messageAttachmentMimeTypeSchema.safeParse(file.type);
    if (!mimeType.success) {
      throw httpError(400, "Format non pris en charge. Utilisez JPEG, PNG, WebP ou PDF.");
    }

    if (file.size <= 0) throw httpError(400, "Fichier vide.");
    if (file.size > MESSAGE_ATTACHMENT_MAX_BYTES) {
      throw httpError(413, "Fichier trop lourd : 10 Mo maximum.");
    }

    // Le PDF ne parle jamais au modèle par la vision (§13.4.1) : son texte est
    // extrait une fois pour toutes ici, jamais reparsé à chaque tour du fil.
    let extractedText: string | null = null;
    if (mimeType.data === "application/pdf") {
      extractedText = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
      if (!extractedText) {
        throw httpError(422, "Ce PDF ne contient pas de texte exploitable (document scanné non pris en charge).");
      }
    }

    return this.attachments.create(
      userId,
      { mimeType: mimeType.data, byteSize: file.size, fileName: file.name, extractedText, file },
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
