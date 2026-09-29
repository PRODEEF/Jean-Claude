import { MESSAGE_ATTACHMENT_MAX_BYTES } from "@jc/domain";
import { AttachmentService, withDescendants } from "./attachment.service.js";
import type { AttachmentRecord, IAttachmentRepository } from "./attachment.repository.interface.js";

const TOKEN = "access-token";

function makeAttachment(overrides: Partial<AttachmentRecord> = {}): AttachmentRecord {
  return {
    id: "att-1",
    messageId: null,
    userId: "user-1",
    workspaceId: null,
    deletedAt: null,
    url: "https://storage.example/att-1.png",
    fileName: "photo.png",
    mimeType: "image/png",
    byteSize: 1024,
    extractedText: null,
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
    softDelete: jest.fn().mockResolvedValue(undefined),
    findWorkspaceRole: jest.fn().mockResolvedValue(null),
    findWorkspaceFiles: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    findWorkspaceFolders: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeFile(byteSize: number, type = "image/png"): File {
  return new File([new Uint8Array(byteSize)], "photo.png", { type });
}

/**
 * PDF minimal construit à la main — même fixture que `core/pdf-text.spec.ts`,
 * pour un seul objet `stream` de texte. Dupliquée plutôt que partagée : deux
 * fichiers de test ne justifient pas un module de fixtures.
 */
function makePdfFile(text: string, fileName = "document.pdf"): File {
  const objects: Record<number, string> = {
    1: `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    2: `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    3: `3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 200 100] /Contents 5 0 R >>\nendobj\n`,
    4: `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  };
  const stream = `BT /F1 24 Tf 10 50 Td (${text}) Tj ET`;
  objects[5] = `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += objects[i];
  }
  const xrefStart = Buffer.byteLength(pdf, "latin1");
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += xref;
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new File([Buffer.from(pdf, "latin1")], fileName, { type: "application/pdf" });
}

describe("AttachmentService", () => {
  describe("upload", () => {
    it("upload une image valide", async () => {
      const attachment = makeAttachment();
      const repo = makeRepository({ create: jest.fn().mockResolvedValue(attachment) });

      const result = await new AttachmentService(repo).upload(
        "user-1",
        makeFile(1024),
        null,
        TOKEN,
      );

      expect(result).toEqual(attachment);
      expect(repo.create).toHaveBeenCalledWith(
        "user-1",
        {
          mimeType: "image/png",
          byteSize: 1024,
          fileName: "photo.png",
          extractedText: null,
          file: expect.any(File),
          workspaceId: null,
        },
        TOKEN,
      );
    });

    it("accepte une image d'exactement 10 Mo", async () => {
      const repo = makeRepository();

      await new AttachmentService(repo).upload(
        "user-1",
        makeFile(MESSAGE_ATTACHMENT_MAX_BYTES),
        null,
        TOKEN,
      );

      expect(repo.create).toHaveBeenCalled();
    });

    it("refuse un fichier vide", async () => {
      const repo = makeRepository();

      await expect(
        new AttachmentService(repo).upload("user-1", makeFile(0), null, TOKEN),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("refuse une image de plus de 10 Mo", async () => {
      const repo = makeRepository();

      await expect(
        new AttachmentService(repo).upload(
          "user-1",
          makeFile(MESSAGE_ATTACHMENT_MAX_BYTES + 1),
          null,
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 413 });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("refuse un format hors périmètre, comme un fichier audio", async () => {
      const repo = makeRepository();

      await expect(
        new AttachmentService(repo).upload("user-1", makeFile(1024, "audio/mpeg"), null, TOKEN),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("upload un PDF contenant du texte exploitable", async () => {
      const attachment = makeAttachment({
        fileName: "document.pdf",
        mimeType: "application/pdf",
        extractedText: "Hello World",
      });
      const repo = makeRepository({ create: jest.fn().mockResolvedValue(attachment) });
      const file = makePdfFile("Hello World");

      const result = await new AttachmentService(repo).upload("user-1", file, null, TOKEN);

      expect(result).toEqual(attachment);
      expect(repo.create).toHaveBeenCalledWith(
        "user-1",
        {
          mimeType: "application/pdf",
          byteSize: file.size,
          fileName: "document.pdf",
          extractedText: "Hello World",
          file: expect.any(File),
          workspaceId: null,
        },
        TOKEN,
      );
    });

    it("refuse un PDF sans texte exploitable, comme un document scanné", async () => {
      const repo = makeRepository();
      const file = new File([new Uint8Array([1, 2, 3, 4, 5])], "scan.pdf", {
        type: "application/pdf",
      });

      await expect(
        new AttachmentService(repo).upload("user-1", file, null, TOKEN),
      ).rejects.toMatchObject({
        status: 422,
      });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("upload un fichier texte brut, lu tel quel sans extraction", async () => {
      const attachment = makeAttachment({
        fileName: "notes.txt",
        mimeType: "text/plain",
        extractedText: "Liste de courses : pain, lait, œufs.",
      });
      const repo = makeRepository({ create: jest.fn().mockResolvedValue(attachment) });
      const file = new File(["Liste de courses : pain, lait, œufs."], "notes.txt", {
        type: "text/plain",
      });

      const result = await new AttachmentService(repo).upload("user-1", file, null, TOKEN);

      expect(result).toEqual(attachment);
      expect(repo.create).toHaveBeenCalledWith(
        "user-1",
        {
          mimeType: "text/plain",
          byteSize: file.size,
          fileName: "notes.txt",
          extractedText: "Liste de courses : pain, lait, œufs.",
          file: expect.any(File),
          workspaceId: null,
        },
        TOKEN,
      );
    });

    it("accepte le Markdown et le CSV au même titre que le texte brut", async () => {
      const repo = makeRepository();

      for (const type of ["text/markdown", "text/csv"]) {
        const file = new File(["contenu"], "fichier", { type });
        await new AttachmentService(repo).upload("user-1", file, null, TOKEN);
      }

      expect(repo.create).toHaveBeenCalledTimes(2);
    });

    it("refuse un fichier texte vide une fois les espaces retirés", async () => {
      const repo = makeRepository();
      const file = new File(["   \n\t  "], "vide.txt", { type: "text/plain" });

      await expect(
        new AttachmentService(repo).upload("user-1", file, null, TOKEN),
      ).rejects.toMatchObject({
        status: 422,
      });
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("supprime une pièce jointe encore en attente d'envoi", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(makeAttachment()) });

      await new AttachmentService(repo).remove("att-1", "user-1", TOKEN);

      expect(repo.delete).toHaveBeenCalledWith("att-1", TOKEN);
    });

    // La distinction « introuvable » / « appartient à un autre utilisateur »
    // se joue au niveau des RLS, à l'intérieur du Repository — non testée
    // unitairement ici (300-tests.md : le Repository ne fait que du mapping).
    it("refuse de supprimer une pièce jointe introuvable", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(null) });

      await expect(
        new AttachmentService(repo).remove("inconnu", "user-1", TOKEN),
      ).rejects.toMatchObject({
        status: 404,
      });
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it("refuse de supprimer une pièce du fil personnel déjà envoyée", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeAttachment({ messageId: "msg-1" })),
      });

      await expect(
        new AttachmentService(repo).remove("att-1", "user-1", TOKEN),
      ).rejects.toMatchObject({
        status: 409,
      });
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it("laisse l'auteur supprimer son fichier d'espace envoyé, sans effacer la ligne", async () => {
      const repo = makeRepository({
        findById: jest
          .fn()
          .mockResolvedValue(makeAttachment({ messageId: "msg-1", workspaceId: "ws-1" })),
      });

      await new AttachmentService(repo).remove("att-1", "user-1", TOKEN);

      expect(repo.softDelete).toHaveBeenCalledWith("att-1", TOKEN);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it("laisse un admin supprimer le fichier d'un autre membre", async () => {
      const repo = makeRepository({
        findById: jest
          .fn()
          .mockResolvedValue(makeAttachment({ messageId: "msg-1", workspaceId: "ws-1" })),
        findWorkspaceRole: jest.fn().mockResolvedValue("admin"),
      });

      await new AttachmentService(repo).remove("att-1", "admin-1", TOKEN);

      expect(repo.findWorkspaceRole).toHaveBeenCalledWith("ws-1", "admin-1", TOKEN);
      expect(repo.softDelete).toHaveBeenCalledWith("att-1", TOKEN);
    });

    it("refuse qu'un simple membre supprime le fichier d'un autre", async () => {
      const repo = makeRepository({
        findById: jest
          .fn()
          .mockResolvedValue(makeAttachment({ messageId: "msg-1", workspaceId: "ws-1" })),
        findWorkspaceRole: jest.fn().mockResolvedValue("member"),
      });

      await expect(
        new AttachmentService(repo).remove("att-1", "bruno", TOKEN),
      ).rejects.toMatchObject({ status: 403 });
      expect(repo.softDelete).not.toHaveBeenCalled();
    });

    it("ne refait rien sur un fichier déjà supprimé", async () => {
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(
          makeAttachment({
            messageId: "msg-1",
            workspaceId: "ws-1",
            deletedAt: "2026-09-30T08:00:00.000Z",
          }),
        ),
      });

      await new AttachmentService(repo).remove("att-1", "user-1", TOKEN);

      expect(repo.softDelete).not.toHaveBeenCalled();
    });
  });

  describe("upload dans un espace", () => {
    it("dépose le fichier dans l'espace d'un membre", async () => {
      const repo = makeRepository({ findWorkspaceRole: jest.fn().mockResolvedValue("member") });

      await new AttachmentService(repo).upload("user-1", makeFile(1024), "ws-1", TOKEN);

      expect(repo.create).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ workspaceId: "ws-1" }),
        TOKEN,
      );
    });

    it("refuse un dépôt dans un espace dont on n'est pas membre", async () => {
      const repo = makeRepository();

      await expect(
        new AttachmentService(repo).upload("user-1", makeFile(1024), "ws-1", TOKEN),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe("listWorkspaceFiles", () => {
    const file = {
      id: "att-1",
      url: "https://storage.example/a.pdf",
      fileName: "budget.pdf",
      mimeType: "application/pdf" as const,
      byteSize: 10,
      groupId: "group-1",
      groupTitle: "Bureau",
      createdAt: "2026-09-30T08:00:00.000Z",
    };

    it("n'autorise un simple membre à supprimer que ses propres fichiers", async () => {
      const repo = makeRepository({
        findWorkspaceRole: jest.fn().mockResolvedValue("member"),
        findWorkspaceFiles: jest.fn().mockResolvedValue({
          items: [
            { ...file, authorId: "user-1" },
            { ...file, id: "att-2", authorId: "bruno" },
          ],
          nextCursor: null,
        }),
      });

      const page = await new AttachmentService(repo).listWorkspaceFiles(
        "user-1",
        { workspaceId: "ws-1", limit: 50 },
        TOKEN,
      );

      expect(page.items.map((item) => item.canDelete)).toEqual([true, false]);
    });

    it("autorise un admin à supprimer tous les fichiers", async () => {
      const repo = makeRepository({
        findWorkspaceRole: jest.fn().mockResolvedValue("admin"),
        findWorkspaceFiles: jest.fn().mockResolvedValue({
          items: [{ ...file, authorId: "bruno" }],
          nextCursor: null,
        }),
      });

      const page = await new AttachmentService(repo).listWorkspaceFiles(
        "admin-1",
        { workspaceId: "ws-1", limit: 50 },
        TOKEN,
      );

      expect(page.items[0]?.canDelete).toBe(true);
    });

    it("filtre par dossier, sous-dossiers compris", async () => {
      const repo = makeRepository({
        findWorkspaceRole: jest.fn().mockResolvedValue("member"),
        findWorkspaceFolders: jest.fn().mockResolvedValue([
          { id: "folder-1", parentId: null },
          { id: "folder-2", parentId: "folder-1" },
          { id: "folder-3", parentId: "folder-2" },
          { id: "folder-4", parentId: null },
        ]),
      });

      await new AttachmentService(repo).listWorkspaceFiles(
        "user-1",
        { workspaceId: "ws-1", folderId: "folder-1", limit: 20 },
        TOKEN,
      );

      expect(repo.findWorkspaceFiles).toHaveBeenCalledWith(
        "ws-1",
        { folderIds: ["folder-1", "folder-2", "folder-3"], limit: 20 },
        TOKEN,
      );
    });

    it("rend un 404 à qui n'est pas membre de l'espace", async () => {
      const repo = makeRepository();

      await expect(
        new AttachmentService(repo).listWorkspaceFiles(
          "dora",
          { workspaceId: "ws-1", limit: 50 },
          TOKEN,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.findWorkspaceFiles).not.toHaveBeenCalled();
    });
  });
});

describe("withDescendants", () => {
  it("rend le dossier seul quand il n'a pas d'enfant", () => {
    expect(withDescendants("a", [{ id: "a", parentId: null }])).toEqual(["a"]);
  });

  it("ne boucle pas sur une arborescence malformée", () => {
    expect(
      withDescendants("a", [
        { id: "a", parentId: "b" },
        { id: "b", parentId: "a" },
      ]).sort(),
    ).toEqual(["a", "b"]);
  });
});
