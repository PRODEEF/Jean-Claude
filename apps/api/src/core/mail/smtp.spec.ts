import { smtpSettingsFor } from "./smtp.js";

describe("smtpSettingsFor", () => {
  it("envoie par le serveur de réception d'OVH et d'Infomaniak, en connexion chiffrée d'emblée", () => {
    expect(smtpSettingsFor("ssl0.ovh.net")).toEqual({
      host: "ssl0.ovh.net",
      port: 465,
      secure: true,
      savesSentCopy: false,
    });
    expect(smtpSettingsFor("mail.infomaniak.com")).toMatchObject({ port: 465, secure: true });
  });

  it("envoie Hotmail / Outlook par son propre serveur, en STARTTLS", () => {
    expect(smtpSettingsFor("outlook.office365.com")).toEqual({
      host: "smtp-mail.outlook.com",
      port: 587,
      secure: false,
      savesSentCopy: true,
    });
  });

  it("ne range pas de seconde copie chez qui range déjà la sienne", () => {
    expect(smtpSettingsFor("outlook.office365.com").savesSentCopy).toBe(true);
    expect(smtpSettingsFor("ssl0.ovh.net").savesSentCopy).toBe(false);
  });
});
