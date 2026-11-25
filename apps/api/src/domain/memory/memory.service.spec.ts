import type { Memory } from "@jc/domain";
import { MEMORY_MAX_PER_USER } from "@jc/domain";
import { MemoryService } from "./memory.service.js";
import type { IMemoryRepository } from "./memory.repository.interface.js";

function memory(content: string, over: Partial<Memory> = {}): Memory {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    content,
    source: "assistant",
    createdAt: "2026-11-25T10:00:00.000Z",
    updatedAt: "2026-11-25T10:00:00.000Z",
    ...over,
  };
}

function makeRepository(overrides: Partial<IMemoryRepository> = {}): IMemoryRepository {
  return {
    findAll: jest.fn().mockResolvedValue([]),
    create: jest
      .fn()
      .mockImplementation((_user, content: string, source: Memory["source"]) =>
        Promise.resolve(memory(content, { source })),
      ),
    update: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe("MemoryService", () => {
  it("retient une chose nouvelle, rognée", async () => {
    const repo = makeRepository();

    const created = await new MemoryService(repo).add(
      "u1",
      "  Aime courir le matin.  ",
      "assistant",
      "t",
    );

    expect(repo.create).toHaveBeenCalledWith("u1", "Aime courir le matin.", "assistant", "t");
    expect(created.content).toBe("Aime courir le matin.");
  });

  it("ne duplique pas ce qu'il sait déjà quand l'assistant le repropose", async () => {
    const existing = memory("Aime courir le matin");
    const repo = makeRepository({ findAll: jest.fn().mockResolvedValue([existing]) });

    const result = await new MemoryService(repo).add(
      "u1",
      "aime courir le matin.",
      "assistant",
      "t",
    );

    expect(result).toBe(existing);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("prévient l'utilisateur qui saisit à la main ce que Jean-Claude sait déjà", async () => {
    const repo = makeRepository({
      findAll: jest.fn().mockResolvedValue([memory("Aime courir le matin")]),
    });

    await expect(
      new MemoryService(repo).add("u1", "Aime courir le matin", "user", "t"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuse d'en retenir plus que la limite", async () => {
    const full = Array.from({ length: MEMORY_MAX_PER_USER }, (_, i) => memory(`Chose ${i}`));
    const repo = makeRepository({ findAll: jest.fn().mockResolvedValue(full) });

    await expect(
      new MemoryService(repo).add("u1", "Une de plus", "user", "t"),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("corrige un souvenir", async () => {
    const repo = makeRepository({
      update: jest.fn().mockResolvedValue(memory("Court le mardi")),
    });

    await expect(
      new MemoryService(repo).update("id", " Court le mardi ", "t"),
    ).resolves.toMatchObject({ content: "Court le mardi" });
    expect(repo.update).toHaveBeenCalledWith("id", "Court le mardi", "t");
  });

  it("dit 404 quand le souvenir à corriger n'existe pas", async () => {
    await expect(new MemoryService(makeRepository()).update("id", "x", "t")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("supprime un souvenir, et dit 404 quand il n'existe pas", async () => {
    await expect(
      new MemoryService(makeRepository({ delete: jest.fn().mockResolvedValue(true) })).delete(
        "id",
        "t",
      ),
    ).resolves.toBeUndefined();
    await expect(new MemoryService(makeRepository()).delete("id", "t")).rejects.toMatchObject({
      status: 404,
    });
  });
});
