import {
  ASSISTANT_MODELS,
  isSovereignModel,
  isVisionCapableModel,
  modelReadingImages,
  toAssistantModel,
  toCatalogueModel,
  VISION_FALLBACK_MODEL,
  updateSettingsPayloadSchema,
  updateUserProfileSchema,
  userPreferencesSchema,
} from "./preferences.schema";

describe("fuseau horaire", () => {
  it("accepte un fuseau IANA que Intl sait manipuler", () => {
    expect(updateUserProfileSchema.safeParse({ timezone: "America/Montreal" }).success).toBe(true);
    expect(updateUserProfileSchema.safeParse({ timezone: "Europe/Paris" }).success).toBe(true);
  });

  it("refuse un fuseau inconnu, qui ferait lever chaque datation du serveur", () => {
    expect(updateUserProfileSchema.safeParse({ timezone: "Mars/Olympus" }).success).toBe(false);
    expect(updateUserProfileSchema.safeParse({ timezone: "" }).success).toBe(false);
  });

  it("reste permissif en lecture : un fuseau écrit avant ne rend pas le profil illisible", () => {
    expect(userPreferencesSchema.parse({ scope: {}, timezone: "Mars/Olympus" }).timezone).toBe(
      "Mars/Olympus",
    );
  });
});

describe("catalogue des modèles", () => {
  it("dit de chaque modèle proposé à quoi il sert, sans jargon", () => {
    for (const model of ASSISTANT_MODELS) {
      expect(model.label.length).toBeGreaterThan(0);
      expect(model.benefit.length).toBeGreaterThan(0);
      // Le §13.4.4 tient l'interface hors du vocabulaire technique : le libellé
      // ne doit pas retomber sur l'identifiant `éditeur/modèle` du Gateway.
      expect(model.label).not.toContain("/");
    }
  });

  it("marque comme hébergé en Europe le seul éditeur qui l'est", () => {
    expect(isSovereignModel("mistral/mistral-medium-3.5")).toBe(true);
    expect(isSovereignModel("openai/gpt-5.4-mini")).toBe(false);
    expect(isSovereignModel("spacexai/grok-4.6")).toBe(false);
  });

  it("ne déduit pas la souveraineté d'un identifiant sans éditeur", () => {
    expect(isSovereignModel("mistral-medium-3.5")).toBe(false);
    expect(isSovereignModel("")).toBe(false);
  });

  it("annonce la souveraineté de chaque entrée conformément à son éditeur", () => {
    for (const model of ASSISTANT_MODELS) {
      expect(model.sovereign).toBe(isSovereignModel(model.id));
    }
  });
});

describe("isVisionCapableModel", () => {
  it("refuse un modèle hors catalogue", () => {
    expect(isVisionCapableModel("openai/gpt-4")).toBe(false);
  });

  it("refuse une chaîne vide", () => {
    expect(isVisionCapableModel("")).toBe(false);
  });

  it("déclare capables les cinq modèles du catalogue, vérifiés individuellement", () => {
    for (const model of ASSISTANT_MODELS) {
      expect(isVisionCapableModel(model.id)).toBe(true);
    }
  });
});

describe("toAssistantModel", () => {
  it("retient un modèle du catalogue", () => {
    expect(toAssistantModel("mistral/ministral-14b")).toBe("mistral/ministral-14b");
  });

  it("rend la main au serveur quand le modèle enregistré n'est plus proposé", () => {
    expect(toAssistantModel("openai/gpt-4")).toBeNull();
    expect(toAssistantModel(null)).toBeNull();
    expect(toAssistantModel(42)).toBeNull();
  });
});

describe("toCatalogueModel", () => {
  it("retient tel quel un modèle servi qui figure au catalogue", () => {
    expect(toCatalogueModel("openai/gpt-5.4-mini")).toBe("openai/gpt-5.4-mini");
  });

  it("rattache un modèle servi hors catalogue à l'entrée de son éditeur", () => {
    expect(toCatalogueModel("mistral/mistral-medium-3.5")).toBe("mistral/ministral-14b");
  });

  it("ne rattache rien quand l'éditeur n'est pas au catalogue", () => {
    expect(toCatalogueModel("anthropic/claude-opus-5")).toBeNull();
    expect(toCatalogueModel("")).toBeNull();
  });
});

describe("préférences", () => {
  it("laisse répondre le modèle du serveur tant que rien n'est choisi", () => {
    expect(userPreferencesSchema.parse({ scope: {} }).llmModel).toBeNull();
  });

  it("accepte qu'on rende la main au serveur après avoir choisi", () => {
    expect(updateUserProfileSchema.parse({ llmModel: null })).toEqual({ llmModel: null });
  });

  it("ouvre le calendrier sur Todo tant que rien n'est choisi", () => {
    expect(userPreferencesSchema.parse({ scope: {} }).calendarDefaultView).toBe("todo");
  });

  it("refuse une vue de calendrier inconnue", () => {
    expect(updateUserProfileSchema.safeParse({ calendarDefaultView: "agenda" }).success).toBe(
      false,
    );
  });

  it("refuse un modèle absent du catalogue", () => {
    expect(updateUserProfileSchema.safeParse({ llmModel: "openai/gpt-4" }).success).toBe(false);
  });

  it("propose cinq modèles, un par éditeur", () => {
    expect(ASSISTANT_MODELS).toHaveLength(5);

    const creators = ASSISTANT_MODELS.map((model) => model.id.split("/")[0]);
    expect(new Set(creators).size).toBe(creators.length);
  });

  it("propose au moins un modèle hébergé en Europe (§8, §13.4.6)", () => {
    expect(ASSISTANT_MODELS.some((model) => model.sovereign)).toBe(true);
  });
});

describe("modelReadingImages", () => {
  it("garde le modèle choisi quand il lit les images", () => {
    expect(modelReadingImages("openai/gpt-5.4-mini")).toBe("openai/gpt-5.4-mini");
  });

  it("confie l'image à un modèle qui la lit quand le modèle actif en est incapable", () => {
    expect(modelReadingImages("anthropic/claude-sonnet-5")).toBe(VISION_FALLBACK_MODEL);
  });

  it("traite un identifiant vide ou inconnu comme incapable de lire une image", () => {
    expect(modelReadingImages("")).toBe(VISION_FALLBACK_MODEL);
    expect(modelReadingImages("mistral/mistral-medium")).toBe(VISION_FALLBACK_MODEL);
  });

  it("se rabat sur un modèle souverain qui lit bien les images", () => {
    expect(isVisionCapableModel(VISION_FALLBACK_MODEL)).toBe(true);
    expect(isSovereignModel(VISION_FALLBACK_MODEL)).toBe(true);
  });
});

describe("updateSettingsPayloadSchema", () => {
  it("accepte un ou plusieurs réglages de la liste", () => {
    expect(updateSettingsPayloadSchema.parse({ theme: "dark", remindByEmail: false })).toEqual({
      theme: "dark",
      remindByEmail: false,
    });
  });

  it("refuse une proposition qui ne change rien", () => {
    expect(updateSettingsPayloadSchema.safeParse({}).success).toBe(false);
  });

  it("écarte le modèle, le périmètre et le fuseau : l'assistant ne les règle pas", () => {
    const parsed = updateSettingsPayloadSchema.safeParse({
      theme: "light",
      llmModel: "openai/gpt-5.4-mini",
      scope: { readsAgenda: false },
      timezone: "Asia/Tokyo",
    });

    expect(parsed.success && parsed.data).toEqual({ theme: "light" });
  });

  it("refuse une valeur hors des choix proposés", () => {
    expect(updateSettingsPayloadSchema.safeParse({ theme: "fluo" }).success).toBe(false);
    expect(
      updateSettingsPayloadSchema.safeParse({
        dayPartBounds: { afternoonFrom: 3, eveningFrom: 19 },
      }).success,
    ).toBe(false);
  });

  it("accepte la taille du texte et la langue, et refuse une valeur hors liste", () => {
    expect(updateSettingsPayloadSchema.parse({ fontScale: "large", language: "en" })).toEqual({
      fontScale: "large",
      language: "en",
    });
    expect(updateSettingsPayloadSchema.safeParse({ fontScale: "énorme" }).success).toBe(false);
    expect(updateSettingsPayloadSchema.safeParse({ language: "klingon" }).success).toBe(false);
  });
});

describe("userPreferencesSchema — apparence et langue", () => {
  it("prend « normal » et « fr » quand rien n'est enregistré", () => {
    const parsed = userPreferencesSchema.parse({ scope: {} });

    expect(parsed.fontScale).toBe("normal");
    expect(parsed.language).toBe("fr");
  });
});
