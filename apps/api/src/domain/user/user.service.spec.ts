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
      llmModel: null,
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
    completeOnboarding: jest.fn().mockResolvedValue(makeRecord()),
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

      expect(update).toHaveBeenCalledWith(
        OWNER.id,
        { displayName: "Clarisse E." },
        OWNER.accessToken,
      );
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

    it("conserve les capacités absentes d'un patch de périmètre (A.10)", async () => {
      const update = jest.fn().mockResolvedValue(makeRecord());
      const service = new UserService(makeRepository({ update }));

      await service.updateProfile(OWNER, { scope: { morningReminders: false } });

      // Les capacités tiennent dans une seule colonne : écrire le patch tel
      // quel effacerait les quatre autres.
      expect(update).toHaveBeenCalledWith(
        OWNER.id,
        {
          scope: {
            morningReminders: false,
            folderOrganization: true,
            structureSuggestions: true,
            proactiveTaskDetection: true,
            proactiveScheduling: true,
          },
        },
        OWNER.accessToken,
      );
    });

    it("ne relit pas le profil quand le patch ne touche pas au périmètre", async () => {
      const findById = jest.fn().mockResolvedValue(makeRecord());
      const service = new UserService(makeRepository({ findById }));

      await service.updateProfile(OWNER, { assistantName: "Marcel" });

      expect(findById).not.toHaveBeenCalled();
    });

    it("enregistre le nom et la couleur choisis pour l'assistant (§4.5)", async () => {
      const update = jest.fn().mockResolvedValue(makeRecord());
      const service = new UserService(makeRepository({ update }));

      await service.updateProfile(OWNER, { assistantName: "Marcel", assistantColor: "#16A34A" });

      expect(update).toHaveBeenCalledWith(
        OWNER.id,
        { assistantName: "Marcel", assistantColor: "#16A34A" },
        OWNER.accessToken,
      );
    });

    it("enregistre le modèle choisi sans relire le profil (§5.1)", async () => {
      const update = jest.fn().mockResolvedValue(makeRecord());
      const findById = jest.fn();
      const service = new UserService(makeRepository({ update, findById }));

      await service.updateProfile(OWNER, { llmModel: "mistral/mistral-large" });

      expect(update).toHaveBeenCalledWith(
        OWNER.id,
        { llmModel: "mistral/mistral-large" },
        OWNER.accessToken,
      );
      expect(findById).not.toHaveBeenCalled();
    });

    it("transmet le retour au modèle du serveur, qui est un choix et non un oubli", async () => {
      const update = jest.fn().mockResolvedValue(makeRecord());
      const service = new UserService(makeRepository({ update }));

      await service.updateProfile(OWNER, { llmModel: null });

      expect(update).toHaveBeenCalledWith(OWNER.id, { llmModel: null }, OWNER.accessToken);
    });

    it("refuse de fusionner un périmètre sur un profil introuvable", async () => {
      const repository = makeRepository({ findById: jest.fn().mockResolvedValue(null) });

      await expect(
        new UserService(repository).updateProfile(OWNER, { scope: { morningReminders: false } }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("completeOnboarding", () => {
    it("clôt l'accueil sans rien retenir quand l'utilisateur passe l'étape (§6.3)", async () => {
      const completeOnboarding = jest
        .fn()
        .mockResolvedValue(makeRecord({ onboardingCompletedAt: "2026-09-02T09:00:00.000Z" }));

      const profile = await new UserService(
        makeRepository({ completeOnboarding }),
      ).completeOnboarding(OWNER);

      // `null` et non une chaîne vide : la mémoire d'un utilisateur qui aurait
      // déjà été accueilli ne doit pas être effacée par un second passage.
      expect(completeOnboarding).toHaveBeenCalledWith(OWNER.id, null, OWNER.accessToken);
      expect(profile.onboardingCompletedAt).toBe("2026-09-02T09:00:00.000Z");
      expect(profile.email).toBe("clarisse@wesprint.fr");
    });
  });
});
