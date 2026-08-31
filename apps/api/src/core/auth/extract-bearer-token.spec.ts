import { extractBearerToken } from "./extract-bearer-token";

describe("extraction du jeton d'authentification", () => {
  it("extrait le jeton d'un en-tête bien formé", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("accepte le schéma quelle que soit sa casse, les clients ne la normalisant pas tous", () => {
    expect(extractBearerToken("bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(extractBearerToken("BEARER abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("retire les espaces autour du jeton", () => {
    expect(extractBearerToken("Bearer  abc.def.ghi  ")).toBe("abc.def.ghi");
  });

  it("refuse un en-tête absent", () => {
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it("refuse un autre schéma d'authentification", () => {
    expect(extractBearerToken("Basic abc.def.ghi")).toBeNull();
  });

  it("refuse un en-tête sans jeton", () => {
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken("Bearer ")).toBeNull();
    expect(extractBearerToken("Bearer    ")).toBeNull();
  });

  it("refuse un jeton transmis seul, sans schéma", () => {
    expect(extractBearerToken("abc.def.ghi")).toBeNull();
  });
});

describe("en-têtes malformés", () => {
  it("refuse un en-tête comportant un segment de trop plutôt que de le tronquer", () => {
    expect(extractBearerToken("Bearer abc.def.ghi surplus")).toBeNull();
  });
});
