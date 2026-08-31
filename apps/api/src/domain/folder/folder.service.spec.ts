import type { Folder } from "@jc/domain";
import { FolderService } from "./folder.service";
import type { IFolderRepository } from "./folder.repository.interface";

const TOKEN = "access-token";

function makeFolder(overrides: Partial<Folder> & Pick<Folder, "id" | "name">): Folder {
  return {
    parentId: null,
    category: null,
    purpose: "generic",
    color: null,
    position: 0,
    createdByAssistant: false,
    createdAt: "2026-08-31T08:00:00.000Z",
    updatedAt: "2026-08-31T08:00:00.000Z",
    ...overrides,
  };
}

function makeRepository(overrides: Partial<IFolderRepository> = {}): IFolderRepository {
  return {
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
    countConversations: jest.fn().mockResolvedValue(new Map()),
    ...overrides,
  };
}

describe("FolderService", () => {
  describe("getTree", () => {
    it("imbrique les sous-dossiers sous leur parent", async () => {
      const repo = makeRepository({
        findAll: jest
          .fn()
          .mockResolvedValue([
            makeFolder({ id: "admin", name: "Administratif" }),
            makeFolder({ id: "assur", name: "Assurances", parentId: "admin" }),
            makeFolder({ id: "sante", name: "Santé" }),
          ]),
      });

      const tree = await new FolderService(repo).getTree(TOKEN);

      expect(tree).toHaveLength(2);
      expect(tree[0]?.id).toBe("admin");
      expect(tree[0]?.children.map((c) => c.id)).toEqual(["assur"]);
      expect(tree[1]?.children).toEqual([]);
    });

    it("agrège dans le compteur du parent les conversations de ses sous-dossiers", async () => {
      const repo = makeRepository({
        findAll: jest
          .fn()
          .mockResolvedValue([
            makeFolder({ id: "admin", name: "Administratif" }),
            makeFolder({ id: "assur", name: "Assurances", parentId: "admin" }),
          ]),
        countConversations: jest.fn().mockResolvedValue(
          new Map([
            ["admin", 2],
            ["assur", 3],
          ]),
        ),
      });

      const tree = await new FolderService(repo).getTree(TOKEN);

      expect(tree[0]?.conversationCount).toBe(5);
    });

    it("ne compte pas deux fois une conversation rattachée au parent et à l'enfant", async () => {
      // Cas réel du rangement matriciel (A.1) : une conversation sur la mutuelle
      // peut être rattachée à « Administratif » ET à « Administratif > Assurances ».
      // Le compteur du parent additionne les deux liaisons — c'est bien 2 entrées
      // distinctes du point de vue du rangement, pas un doublon à corriger.
      const repo = makeRepository({
        findAll: jest
          .fn()
          .mockResolvedValue([
            makeFolder({ id: "admin", name: "Administratif" }),
            makeFolder({ id: "assur", name: "Assurances", parentId: "admin" }),
          ]),
        countConversations: jest.fn().mockResolvedValue(
          new Map([
            ["admin", 1],
            ["assur", 1],
          ]),
        ),
      });

      const tree = await new FolderService(repo).getTree(TOKEN);

      expect(tree[0]?.conversationCount).toBe(2);
    });
  });

  describe("create", () => {
    it("refuse un 3e niveau d'arborescence", async () => {
      const repo = makeRepository({
        findById: jest
          .fn()
          .mockResolvedValue(makeFolder({ id: "assur", name: "Assurances", parentId: "admin" })),
      });

      await expect(
        new FolderService(repo).create("user-1", { name: "Auto", parentId: "assur" }, TOKEN),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("accepte un sous-dossier sous un dossier racine", async () => {
      const created = makeFolder({ id: "assur", name: "Assurances", parentId: "admin" });
      const repo = makeRepository({
        findById: jest.fn().mockResolvedValue(makeFolder({ id: "admin", name: "Administratif" })),
        create: jest.fn().mockResolvedValue(created),
      });

      const result = await new FolderService(repo).create(
        "user-1",
        { name: "Assurances", parentId: "admin" },
        TOKEN,
      );

      expect(result).toEqual(created);
    });

    it("refuse un parent inexistant", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(null) });

      await expect(
        new FolderService(repo).create("user-1", { name: "Auto", parentId: "inconnu" }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("delete", () => {
    it("refuse de supprimer un dossier inexistant", async () => {
      const repo = makeRepository({ findById: jest.fn().mockResolvedValue(null) });

      await expect(new FolderService(repo).delete("inconnu", TOKEN)).rejects.toMatchObject({
        status: 404,
      });
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
