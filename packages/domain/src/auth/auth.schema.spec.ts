import {
  emailSchema,
  isCompleteOtpCode,
  isValidEmail,
  normalizeEmail,
  normalizeOtpCode,
  otpCodeSchema,
  OTP_CODE_LENGTH,
} from "./auth.schema";

describe("adresse e-mail", () => {
  it("abaisse la casse et retire les espaces, pour que la demande et la vérification portent sur la même chaîne", () => {
    expect(emailSchema.parse("  Clarisse@Exemple.FR  ")).toBe("clarisse@exemple.fr");
  });

  it("accepte une adresse déjà canonique sans la modifier", () => {
    expect(normalizeEmail("clarisse@exemple.fr")).toBe("clarisse@exemple.fr");
  });

  it("refuse une adresse sans domaine", () => {
    expect(normalizeEmail("clarisse@")).toBeNull();
    expect(isValidEmail("clarisse")).toBe(false);
  });

  it("refuse une chaîne vide", () => {
    expect(isValidEmail("   ")).toBe(false);
  });

  it("refuse une adresse dépassant la limite de la RFC 5321", () => {
    const tropLongue = `${"a".repeat(250)}@exemple.fr`;
    expect(isValidEmail(tropLongue)).toBe(false);
  });
});

describe("code à usage unique", () => {
  it("accepte un code de la longueur attendue", () => {
    expect(otpCodeSchema.parse("42891374")).toBe("42891374");
  });

  it("accepte un code copié avec des espaces ou des tirets, mise en forme fréquente des clients mail", () => {
    expect(otpCodeSchema.parse(" 4289 1374 ")).toBe("42891374");
    expect(otpCodeSchema.parse("4289-1374")).toBe("42891374");
  });

  it("refuse un code incomplet", () => {
    expect(isCompleteOtpCode("4289")).toBe(false);
  });

  it("refuse un code plus long que prévu", () => {
    expect(isCompleteOtpCode("428913745")).toBe(false);
  });

  it("refuse un code contenant des lettres, une fois les chiffres isolés", () => {
    expect(isCompleteOtpCode("42AB1374")).toBe(false);
  });

  it("tronque la saisie à la longueur attendue plutôt que de laisser le champ déborder", () => {
    expect(normalizeOtpCode("428913745")).toHaveLength(OTP_CODE_LENGTH);
    expect(normalizeOtpCode("4289 1374")).toBe("42891374");
  });

  it("ne renvoie que des chiffres, quelle que soit la saisie", () => {
    expect(normalizeOtpCode("abc")).toBe("");
  });
});
