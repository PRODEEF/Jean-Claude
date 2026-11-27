import { APP_PASSWORD_PROVIDERS, MAIL_PROVIDERS, mailHostSchema } from "./mail.schema";

describe("mailHostSchema", () => {
  it("accepte les serveurs des fournisseurs proposés", () => {
    for (const provider of MAIL_PROVIDERS) {
      expect(mailHostSchema.safeParse(provider.host).success).toBe(true);
    }
  });

  it("accepte le serveur Hotmail / Outlook", () => {
    expect(mailHostSchema.safeParse("outlook.office365.com").success).toBe(true);
    expect(mailHostSchema.safeParse(" Outlook.Office365.com ").success).toBe(true);
  });

  it("refuse une machine qui n'est pas un fournisseur connu : le serveur ne s'y connecterait pas", () => {
    expect(mailHostSchema.safeParse("imap.exemple.fr").success).toBe(false);
    expect(mailHostSchema.safeParse("localhost").success).toBe(false);
    // Un nom qui ressemble au bon sans en être : le suffixe ne suffit pas.
    expect(mailHostSchema.safeParse("outlook.office365.com.pirate.net").success).toBe(false);
    expect(mailHostSchema.safeParse("evil-outlook.office365.com").success).toBe(false);
  });
});

describe("fournisseurs", () => {
  it("dit que Hotmail / Outlook demande un mot de passe d'application", () => {
    expect(APP_PASSWORD_PROVIDERS).toContain("outlook");
    expect(APP_PASSWORD_PROVIDERS).not.toContain("ovh");
  });
});
