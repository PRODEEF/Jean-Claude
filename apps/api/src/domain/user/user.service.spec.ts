import { UserService, type ProfileOwner } from "./user.service.js";
import type { IUserRepository, ProfileRecord } from "./user.repository.interface.js";

const OWNER: ProfileOwner = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "clarisse@wesprint.fr",
  accessToken: "access-token",
};

function makeRecord(overrides: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    id: OWNER.id,
    displayName: "Clarisse",
    memory: null,
    onboardingCompletedAt: null,
    createdAt: "2026-08-31T08:00:00.000Z",
    preferences: {
      assistantName: "Jean-Claude",
      assistantColor: "#6366F1",
      theme: "system",
      timezone: "Europe/Paris",
      speakResponses: false,
      scope: {
        morningReminders: true,
        folderOrganization: true,
        structureSuggestions: true,
        proactiveTaskDetection: true,
        proactiveScheduling: true,
      },
    },
    ...overrides,
  };
}

function makeRepository(overrides: Partial<IUserRepository> = {}): IUserRepository {
  return {
    findById: jest.fn().mockResolvedValue(makeRecord()),
    update: jest.fn().mockResolvedValue(makeRecord()),
    ...overrides,
  };
}

describe("UserService", () => {
  describe("getProfile", () => {
    it("complète le profil avec l'e-mail de la session, absent de la table", async () => {
      const service = new UserService(makeRepository());

      const profile = await service.getProfile(OWNER);

      expect(profile.email).toBe("clarisse@wesprint.fr");
      expect(profile.displayName).toBe("Clarisse");
      expect(profile.preferences.theme).toBe("system");
    });

    it("rend un profil dont le pseudo n'a jamais été renseigné", async () => {
      const repository = makeRepository({
        findById: jest.fn().mockResolvedValue(makeRecord({ displayName: null })),
      });

      const profile = await new UserService(repository).getProfile(OWNER);

      expect(profile.displayName).toBeNull();
      expect(profile.email).toBe("clarisse@wesprint.fr");
    });

    it("refuse de servir un profil qui n'existe pas", async () => {
      const repository = makeRepository({ findById: jest.fn().mockResolvedValue(null) });

      await expect(new UserService(repository).getProfile(OWNER)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe("updateProfile", () => {
    it("transmet le patch au dépôt sous l'identité de l'appelant", async () => {
      const update = jest.fn().mockResolvedValue(makeRecord({ displayName: "Clarisse E." }));
      const service = new UserService(makeRepository({ update }));

      const profile = await service.updateProfile(OWNER, { displayName: "Clarisse E." });

      expect(update).toHaveBeenCalledWith(OWNER.id, { displayName: "Clarisse E." }, OWNER.accessToken);
      expect(profile.displayName).toBe("Clarisse E.");
    });

    it("rend le profil mis à jour avec son e-mail", async () => {
      const repository = makeRepository({
        update: jest.fn().mockResolvedValue(
          makeRecord({
            preferences: { ...makeRecord().preferences, theme: "dark" },
          }),
        ),
      });

      const profile = await new UserService(repository).updateProfile(OWNER, { theme: "dark" });

      expect(profile.preferences.theme).toBe("dark");
      expect(profile.email).toBe("clarisse@wesprint.fr");
    });
  });
});
