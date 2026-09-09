import { MESSAGE_ATTACHMENT_MAX_BYTES } from "@jc/domain";
import { AttachmentService } from "./attachment.service.js";
import type { AttachmentRecord, IAttachmentRepository } from "./attachment.repository.interface.js";

const TOKEN = "access-token";

function makeAttachment(overrides: Partial<AttachmentRecord> = {}): AttachmentRecord {
  return {
    id: "att-1",
    messageId: null,
    url: "https://storage.example/att-1.png",
    mimeType: "image/png",
    byteSize: 1024,
    createdAt: "2026-09-09T08:00:00.000Z",
    ...overrides,
  };
}

function makeRepository(overrides: Partial<IAttachmentRepository> = {}): IAttachmentRepository {
  return {
    create: jest.fn().mockResolvedValue(makeAttachment()),
    findById: jest.fn().mockResolvedValue(null),
    findByIds: jest.fn().mockResolvedValue([]),
    linkToMessage: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeFile(byteSize: number, type = "image/png"): File {
  return new File([new Uint8Array(byteSize)], "photo.png", { type });
}

describe("AttachmentService", () => {
  describe("upload", () => {
    it("upload une image valide", async () => {
      const attachment = makeAttachment();
      const repo = makeRepository({ create: jest.fn().mockResolvedValue(attachment) });

      const result = await new AttachmentService(repo).upload("user-1", makeFile(1024), TOKEN);

      expect(result).toEqual(attachment);
      expect(repo.create).toHaveBeenCalledWith(
        "user-1",
        { mimeType: "image/png", byteSize: 1024, file: expect.any(File) },
        TOKEN,
      );
    });

    it("accepte une image d'exactement 10 Mo", async () => {
      const repo = makeRepository();

      await new AttachmentService(repo).upload(
        "user-1",
        makeFile(MESSAGE_ATTACHMENT_MAX_BYTES),
        TOKEN,
      );

      expect(repo.create).toHaveBeenCalled();
    });

    it("refuse un fichier vide", async () => {
      const repo = makeRepository();

      await expect(
        new AttachmentService(repo).upload("user-1", makeFile(0), TOKEN),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("refuse une image de plus de 10 Mo", async () => {
      const repo = makeRepository();

      await expect(
        new AttachmentService(repo).upload("user-1", makeFile(MESSAGE_ATTACHMENT_MAX_BYTES + 1), TOKEN),
      ).rejects.toMatchObject({ status: 413 });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("refuse un format hors périmètre, comme un PDF", async () => {
      const repo = makeRepository();

      await expect(
        new AttachmentService(repo).upload("user-1", makeFile(1024, "application/pdf"), TOKEN),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("supprime une pièce jointe encore en attente d'envoi", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeAttachment()) });

      await new AttachmentService(repo).remove("att-1", TOKEN);

      expect(repo.delete).toHaveBeenCalledWith("att-1", TOKEN);
    });

    // La distinction « introuvable » / « appartient à un autre utilisateur »
    // se joue au niveau des RLS, à l'intérieur du Repository — non testée
    // unitairement ici (300-tests.md : le Repository ne fait que du mapping).
    it("refuse de supprimer une pièce jointe introuvable", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(null) });

      await expect(new AttachmentService(repo).remove("inconnu", TOKEN)).rejects.toMatchObject({
        status: 404,
      });
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it("refuse de supprimer une pièce jointe déjà liée à un message envoyé", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeAttachment({ messageId: "msg-1" })),
      });

      await expect(new AttachmentService(repo).remove("att-1", TOKEN)).rejects.toMatchObject({
        status: 409,
      });
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
