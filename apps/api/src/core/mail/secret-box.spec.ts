import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "./secret-box.js";

const KEY = randomBytes(32).toString("base64");

describe("secret-box", () => {
  it("rend le secret d'origine après chiffrement puis déchiffrement", () => {
    expect(decryptSecret(encryptSecret("mot de passe é!", KEY), KEY)).toBe("mot de passe é!");
  });

  it("ne laisse pas le secret en clair dans la forme stockée", () => {
    expect(encryptSecret("hunter2", KEY)).not.toContain("hunter2");
  });

  it("produit une forme différente à chaque chiffrement du même secret", () => {
    expect(encryptSecret("hunter2", KEY)).not.toBe(encryptSecret("hunter2", KEY));
  });

  it("refuse de déchiffrer avec une autre clé", () => {
    const stored = encryptSecret("hunter2", KEY);
    expect(() => decryptSecret(stored, randomBytes(32).toString("base64"))).toThrow();
  });

  it("refuse une clé qui ne fait pas 32 octets", () => {
    expect(() => encryptSecret("x", Buffer.from("trop courte").toString("base64"))).toThrow(
      /32 octets/,
    );
  });
});
