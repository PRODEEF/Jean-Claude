import {
  ASSISTANT_MODELS,
  isSovereignModel,
  toAssistantModel,
  updateUserProfileSchema,
  userPreferencesSchema,
} from "./preferences.schema";

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
    expect(isSovereignModel("mistral/mistral-large")).toBe(true);
    expect(isSovereignModel("anthropic/claude-sonnet-5")).toBe(false);
    expect(isSovereignModel("deepseek/deepseek-chat")).toBe(false);
  });

  it("ne déduit pas la souveraineté d'un identifiant sans éditeur", () => {
    expect(isSovereignModel("mistral-large")).toBe(false);
    expect(isSovereignModel("")).toBe(false);
  });

  it("annonce la souveraineté de chaque entrée conformément à son éditeur", () => {
    for (const model of ASSISTANT_MODELS) {
      expect(model.sovereign).toBe(isSovereignModel(model.id));
    }
  });
});

describe("toAssistantModel", () => {
  it("retient un modèle du catalogue", () => {
    expect(toAssistantModel("mistral/mistral-large")).toBe("mistral/mistral-large");
  });

  it("rend la main au serveur quand le modèle enregistré n'est plus proposé", () => {
    expect(toAssistantModel("openai/gpt-4")).toBeNull();
    expect(toAssistantModel(null)).toBeNull();
    expect(toAssistantModel(42)).toBeNull();
  });
});

describe("préférences", () => {
  it("laisse répondre le modèle du serveur tant que rien n'est choisi", () => {
    expect(userPreferencesSchema.parse({ scope: {} }).llmModel).toBeNull();
  });

  it("accepte qu'on rende la main au serveur après avoir choisi", () => {
    expect(updateUserProfileSchema.parse({ llmModel: null })).toEqual({ llmModel: null });
  });

  it("refuse un modèle absent du catalogue", () => {
    expect(updateUserProfileSchema.safeParse({ llmModel: "openai/gpt-4" }).success).toBe(false);
  });
});
