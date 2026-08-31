import { isAllowedOrigin } from "./allowed-origin";

/** Ce que porterait `CORS_ORIGIN` en production. */
const PATTERNS = ["https://jean-claude-web.vercel.app", "https://jean-claude-web-*.vercel.app"];

describe("origines autorisées", () => {
  it("accepte une origine listée telle quelle", () => {
    expect(isAllowedOrigin("https://jean-claude-web.vercel.app", PATTERNS)).toBe(true);
  });

  it("accepte une URL de preview, dont le nom change à chaque déploiement", () => {
    expect(isAllowedOrigin("https://jean-claude-web-git-feat-x-prodeef.vercel.app", PATTERNS)).toBe(
      true,
    );
  });

  it("refuse une origine absente de la liste", () => {
    expect(isAllowedOrigin("https://attaquant.fr", PATTERNS)).toBe(false);
  });

  it("refuse un autre projet du même hébergeur", () => {
    expect(isAllowedOrigin("https://autre-projet.vercel.app", PATTERNS)).toBe(false);
  });

  it("refuse un sous-domaine glissé sous le joker", () => {
    // Le point de trop : n'importe qui peut créer ce sous-domaine et le faire
    // pointer où il veut. C'est la faille classique des jokers CORS.
    expect(isAllowedOrigin("https://jean-claude-web-x.attaquant.vercel.app", PATTERNS)).toBe(false);
  });

  it("refuse un joker vide, qui n'est l'URL de personne", () => {
    expect(isAllowedOrigin("https://jean-claude-web-.vercel.app", PATTERNS)).toBe(false);
  });

  it("refuse tout quand aucune origine n'est déclarée", () => {
    expect(isAllowedOrigin("https://jean-claude-web.vercel.app", [])).toBe(false);
  });
});
