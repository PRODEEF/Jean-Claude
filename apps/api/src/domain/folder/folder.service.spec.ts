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

/** Chaîne de `depth` dossiers imbriqués, nommés `n1`, `n2`… du plus haut au plus bas. */
function makeChain(depth: number): Folder[] {
  return Array.from({ length: depth }, (_, index) =>
    makeFolder({
      id: `n${index + 1}`,
      name: `Niveau ${index + 1}`,
      parentId: index === 0 ? null : `n${index}`,
    }),
  );
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

    it("imbrique l'arborescence jusqu'au 5e niveau", async () => {
      const repo = makeRepository({ findAll: jest.fn().mockResolvedValue(makeChain(5)) });

      const tree = await new FolderService(repo).getTree(TOKEN);

      expect(tree[0]?.children[0]?.children[0]?.children[0]?.children[0]?.id).toBe("n5");
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

    it("fait remonter le compteur depuis les descendants les plus profonds", async () => {
      const repo = makeRepository({
        findAll: jest
          .fn()
          .mockResolvedValue([
            makeFolder({ id: "admin", name: "Administratif" }),
            makeFolder({ id: "assur", name: "Assurances", parentId: "admin" }),
            makeFolder({ id: "auto", name: "Auto", parentId: "assur" }),
          ]),
        countConversations: jest.fn().mockResolvedValue(
          new Map([
            ["admin", 1],
            ["assur", 2],
            ["auto", 4],
          ]),
        ),
      });

      const tree = await new FolderService(repo).getTree(TOKEN);

      expect(tree[0]?.conversationCount).toBe(7);
      expect(tree[0]?.children[0]?.conversationCount).toBe(6);
      expect(tree[0]?.children[0]?.children[0]?.conversationCount).toBe(4);
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
    it("accepte un sous-dossier sous un dossier racine", async () => {
      const created = makeFolder({ id: "assur", name: "Assurances", parentId: "admin" });
      const repo = makeRepository({
        findAll: jest.fn().mockResolvedValue([makeFolder({ id: "admin", name: "Administratif" })]),
        create: jest.fn().mockResolvedValue(created),
      });

      const result = await new FolderService(repo).create(
        "user-1",
        { name: "Assurances", parentId: "admin" },
        TOKEN,
      );

      expect(result).toEqual(created);
    });

    it("accepte un 5e niveau", async () => {
      const created = makeFolder({ id: "n5", name: "Niveau 5", parentId: "n4" });
      const repo = makeRepository({
        findAll: jest.fn().mockResolvedValue(makeChain(4)),
        create: jest.fn().mockResolvedValue(created),
      });

      const result = await new FolderService(repo).create(
        "user-1",
        { name: "Niveau 5", parentId: "n4" },
        TOKEN,
      );

      expect(result).toEqual(created);
    });

    it("refuse un 6e niveau d'arborescence", async () => {
      const repo = makeRepository({ findAll: jest.fn().mockResolvedValue(makeChain(5)) });

      await expect(
        new FolderService(repo).create("user-1", { name: "Trop bas", parentId: "n5" }, TOKEN),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("refuse un parent inexistant", async () => {
      const repo = makeRepository({ findAll: jest.fn().mockResolvedValue([]) });

      await expect(
        new FolderService(repo).create("user-1", { name: "Auto", parentId: "inconnu" }, TOKEN),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("ne consulte pas l'arborescence pour un dossier racine", async () => {
      const created = makeFolder({ id: "sante", name: "Santé" });
      const repo = makeRepository({ create: jest.fn().mockResolvedValue(created) });

      await new FolderService(repo).create("user-1", { name: "Santé" }, TOKEN);

      expect(repo.findAll).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("refuse de ranger un dossier sous lui-même", async () => {
      const repo = makeRepository({ findAll: jest.fn().mockResolvedValue(makeChain(3)) });

      await expect(
        new FolderService(repo).update("n1", { parentId: "n1" }, TOKEN),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it("refuse de ranger un dossier sous l'un de ses propres sous-dossiers", async () => {
      const repo = makeRepository({ findAll: jest.fn().mockResolvedValue(makeChain(3)) });

      await expect(
        new FolderService(repo).update("n1", { parentId: "n3" }, TOKEN),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it("refuse un déplacement qui pousserait les sous-dossiers au-delà du 5e niveau", async () => {
      // « n1 » emmène une branche de 3 niveaux. La ranger sous « n4 », qui est
      // déjà au 4e, en amènerait le fond au 6e — que le trigger SQL ne verrait
      // pas, puisqu'aucune ligne de descendant n'est écrite.
      const repo = makeRepository({
        findAll: jest
          .fn()
          .mockResolvedValue([
            ...makeChain(3),
            makeFolder({ id: "autre", name: "Autre" }),
            makeFolder({ id: "a2", name: "Autre 2", parentId: "autre" }),
            makeFolder({ id: "a3", name: "Autre 3", parentId: "a2" }),
            makeFolder({ id: "a4", name: "Autre 4", parentId: "a3" }),
          ]),
      });

      await expect(
        new FolderService(repo).update("n1", { parentId: "a4" }, TOKEN),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it("accepte un déplacement qui tient dans les 5 niveaux", async () => {
      const moved = makeFolder({ id: "n3", name: "Niveau 3", parentId: "sante" });
      const repo = makeRepository({
        findAll: jest
          .fn()
          .mockResolvedValue([...makeChain(3), makeFolder({ id: "sante", name: "Santé" })]),
        update: jest.fn().mockResolvedValue(moved),
      });

      const result = await new FolderService(repo).update("n3", { parentId: "sante" }, TOKEN);

      expect(result).toEqual(moved);
    });

    it("ne consulte pas l'arborescence quand le dossier remonte à la racine", async () => {
      const moved = makeFolder({ id: "n3", name: "Niveau 3" });
      const repo = makeRepository({ update: jest.fn().mockResolvedValue(moved) });

      await new FolderService(repo).update("n3", { parentId: null }, TOKEN);

      expect(repo.findAll).not.toHaveBeenCalled();
    });

    it("refuse un parent inexistant", async () => {
      const repo = makeRepository({ findAll: jest.fn().mockResolvedValue(makeChain(3)) });

      await expect(
        new FolderService(repo).update("n3", { parentId: "inconnu" }, TOKEN),
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
