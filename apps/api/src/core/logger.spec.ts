import { logger } from "./logger.js";

describe("logger", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("préfixe un avertissement par son scope", () => {
    const spy = jest.spyOn(console, "warn").mockImplementation();
    logger.warn("conversation.service", "Profil introuvable");
    expect(spy).toHaveBeenCalledWith("[conversation.service] Profil introuvable");
  });

  it("préfixe une erreur par son scope", () => {
    const spy = jest.spyOn(console, "error").mockImplementation();
    logger.error("core.http", "Exception non gérée");
    expect(spy).toHaveBeenCalledWith("[core.http] Exception non gérée");
  });

  it("transmet un détail additionnel tel quel", () => {
    const spy = jest.spyOn(console, "warn").mockImplementation();
    const detail = { id: "abc" };
    logger.warn("suggestion.service", "Appel d'outil illisible", detail);
    expect(spy).toHaveBeenCalledWith("[suggestion.service] Appel d'outil illisible", detail);
  });

  it("n'ajoute aucun argument supplémentaire sans détail", () => {
    const spy = jest.spyOn(console, "error").mockImplementation();
    logger.error("gateway.provider", "Échec du flux du moteur IA");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]).toHaveLength(1);
  });
});
