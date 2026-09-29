import {
  MESSAGE_ATTACHMENT_MAX_BYTES,
  messageAttachmentMimeTypeSchema,
  type ListWorkspaceFilesQuery,
  type MessageAttachment,
  type MessageAttachmentMimeType,
  type Paginated,
  type WorkspaceFile,
} from "@jc/domain";
import { extractPdfText } from "../../core/pdf-text.js";
import { httpError } from "../../core/http.js";
import type { IAttachmentRepository } from "./attachment.repository.interface.js";

/** Types dont le contenu est déjà du texte — lu tel quel, sans extraction. */
const PLAIN_TEXT_MIME_TYPES: readonly MessageAttachmentMimeType[] = [
  "text/plain",
  "text/markdown",
  "text/csv",
];

export class AttachmentService {
  constructor(private readonly attachments: IAttachmentRepository) {}

  /**
   * `workspaceId` : fichier déposé pour une conversation de cet espace (lot 7).
   * Il n'est lisible des autres qu'une fois envoyé, et seulement des membres
   * de la conversation.
   */
  async upload(
    userId: string,
    file: File,
    workspaceId: string | null,
    accessToken: string,
  ): Promise<MessageAttachment> {
    const mimeType = messageAttachmentMimeTypeSchema.safeParse(file.type);
    if (!mimeType.success) {
      throw httpError(
        400,
        "Format non pris en charge. Utilisez une image, un PDF ou un fichier texte (.txt, .md, .csv).",
      );
    }

    if (file.size <= 0) throw httpError(400, "Fichier vide.");
    if (file.size > MESSAGE_ATTACHMENT_MAX_BYTES) {
      throw httpError(413, "Fichier trop lourd : 10 Mo maximum.");
    }

    if (
      workspaceId &&
      !(await this.attachments.findWorkspaceRole(workspaceId, userId, accessToken))
    ) {
      throw httpError(404, "Espace introuvable.");
    }

    // Ni le PDF ni le texte brut ne parlent jamais au modèle par la vision
    // (§13.4.1) : leur texte est lu une fois pour toutes ici, jamais reparsé
    // à chaque tour du fil.
    let extractedText: string | null = null;
    if (mimeType.data === "application/pdf") {
      extractedText = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
      if (!extractedText) {
        throw httpError(
          422,
          "Ce PDF ne contient pas de texte exploitable (document scanné non pris en charge).",
        );
      }
    } else if (PLAIN_TEXT_MIME_TYPES.includes(mimeType.data)) {
      const text = (await file.text()).trim();
      if (text.length === 0)
        throw httpError(422, "Ce fichier ne contient aucun texte exploitable.");
      extractedText = text;
    }

    return this.attachments.create(
      userId,
      {
        mimeType: mimeType.data,
        byteSize: file.size,
        fileName: file.name,
        extractedText,
        file,
        workspaceId,
      },
      accessToken,
    );
  }

  /**
   * Retire une pièce jointe.
   *
   * Pas encore envoyée : elle disparaît — le trombone permet de revenir dessus
   * avant l'envoi. Déjà envoyée dans une conversation d'espace : son auteur ou
   * un admin la supprime, le message garde la mention « Fichier supprimé ».
   * Déjà envoyée dans le fil personnel : elle fait partie de la trace.
   */
  async remove(id: string, userId: string, accessToken: string): Promise<void> {
    const attachment = await this.attachments.findById(id, accessToken);
    if (!attachment) throw httpError(404, "Pièce jointe introuvable.");

    if (attachment.messageId === null) {
      await this.attachments.delete(id, accessToken);
      return;
    }

    if (attachment.workspaceId === null) {
      throw httpError(409, "Cette pièce jointe fait déjà partie d'un message envoyé.");
    }
    if (attachment.deletedAt !== null) return;

    if (attachment.userId !== userId) {
      const role = await this.attachments.findWorkspaceRole(
        attachment.workspaceId,
        userId,
        accessToken,
      );
      if (role !== "admin") {
        throw httpError(403, "Seuls son auteur et les admins de l'espace suppriment ce fichier.");
      }
    }

    await this.attachments.softDelete(id, accessToken);
  }

  /** Page « Fichiers » d'un espace : ceux des conversations dont l'appelant est membre. */
  async listWorkspaceFiles(
    userId: string,
    query: ListWorkspaceFilesQuery,
    accessToken: string,
  ): Promise<Paginated<WorkspaceFile>> {
    const role = await this.attachments.findWorkspaceRole(query.workspaceId, userId, accessToken);
    if (!role) throw httpError(404, "Espace introuvable.");

    // Un dossier contient ses sous-dossiers : on raisonne en « ce que contient
    // Budget », comme le compteur de la barre latérale.
    const folderIds = query.folderId
      ? withDescendants(
          query.folderId,
          await this.attachments.findWorkspaceFolders(query.workspaceId, accessToken),
        )
      : null;

    const page = await this.attachments.findWorkspaceFiles(
      query.workspaceId,
      {
        ...(folderIds ? { folderIds } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
        limit: query.limit,
      },
      accessToken,
    );

    return {
      items: page.items.map((file) => ({
        ...file,
        canDelete: role === "admin" || file.authorId === userId,
      })),
      nextCursor: page.nextCursor,
    };
  }
}

/**
 * Le dossier et tous ses descendants, à toute profondeur. Un dossier inconnu
 * ne rend que lui-même : le filtre ne trouve alors rien, sans erreur.
 */
export function withDescendants(
  folderId: string,
  folders: { id: string; parentId: string | null }[],
): string[] {
  const found = new Set([folderId]);
  let frontier = [folderId];
  while (frontier.length > 0) {
    const next = folders
      .filter((folder) => folder.parentId !== null && frontier.includes(folder.parentId))
      .map((folder) => folder.id)
      .filter((id) => !found.has(id));
    for (const id of next) found.add(id);
    frontier = next;
  }
  return [...found];
}
