import { bearerMatches } from "./cron.js";

describe("bearerMatches", () => {
  it("accepte l'en-tête qui porte le bon secret", () => {
    expect(bearerMatches("Bearer s3cret", "s3cret")).toBe(true);
  });

  it("refuse un autre secret, de même longueur ou non", () => {
    expect(bearerMatches("Bearer s3crex", "s3cret")).toBe(false);
    expect(bearerMatches("Bearer s3cret-et-plus", "s3cret")).toBe(false);
  });

  it("refuse un en-tête absent ou sans « Bearer »", () => {
    expect(bearerMatches(undefined, "s3cret")).toBe(false);
    expect(bearerMatches("s3cret", "s3cret")).toBe(false);
  });

  it("ne laisse rien passer tant que le secret n'est pas configuré", () => {
    expect(bearerMatches("Bearer ", "")).toBe(false);
    expect(bearerMatches(undefined, "")).toBe(false);
  });
});
