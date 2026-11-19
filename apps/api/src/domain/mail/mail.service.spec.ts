import { randomBytes } from "node:crypto";
import type { MailMessage } from "@jc/domain";
import type { IMailbox } from "../../core/mail/mailbox.js";
import { decryptSecret } from "../../core/mail/secret-box.js";
import type { IMailRepository, StoredMailAccount } from "./mail.repository.interface.js";
import { MailService } from "./mail.service.js";

const KEY = randomBytes(32).toString("base64");

const INPUT = { address: "yann@exemple.fr", password: "secret", host: "ssl0.ovh.net" };

function makeRepository(overrides: Partial<IMailRepository> = {}): IMailRepository {
  return {
    find: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockImplementation(async (_userId, input) => ({
      id: "11111111-1111-4111-8111-111111111111",
      address: input.address,
      host: input.host,
      createdAt: "2026-11-20T09:00:00.000Z",
    })),
    remove: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeMailbox(overrides: Partial<IMailbox> = {}): IMailbox {
  return {
    verify: jest.fn().mockResolvedValue(undefined),
    listFolders: jest.fn().mockResolvedValue([]),
    listMessages: jest.fn().mockResolvedValue([]),
    readMessage: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function stored(passwordEncrypted: string): StoredMailAccount {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    address: INPUT.address,
    host: INPUT.host,
    createdAt: "2026-11-20T09:00:00.000Z",
    passwordEncrypted,
  };
}

/** Dépôt qui porte une boîte déjà reliée, avec son vrai mot de passe chiffré. */
async function repositoryWithAccount(): Promise<IMailRepository> {
  const saving = makeRepository();
  await new MailService(saving, makeMailbox(), KEY).connect("u1", INPUT, "token");
  const encrypted = (saving.save as jest.Mock).mock.calls[0][1].passwordEncrypted;
  return makeRepository({ find: jest.fn().mockResolvedValue(stored(encrypted)) });
}

describe("MailService", () => {
  describe("connect", () => {
    it("vérifie la boîte puis garde le mot de passe chiffré, jamais en clair", async () => {
      const accounts = makeRepository();
      const service = new MailService(accounts, makeMailbox(), KEY);

      const account = await service.connect("u1", INPUT, "token");

      const saved = (accounts.save as jest.Mock).mock.calls[0]?.[1];
      expect(saved.passwordEncrypted).not.toContain("secret");
      expect(decryptSecret(saved.passwordEncrypted, KEY)).toBe("secret");
      expect(account).not.toHaveProperty("passwordEncrypted");
    });

    it("n'enregistre rien quand la boîte refuse la connexion", async () => {
      const accounts = makeRepository();
      const mailbox = makeMailbox({
        verify: jest.fn().mockRejectedValue(new Error("AUTH failed")),
      });
      const service = new MailService(accounts, mailbox, KEY);

      await expect(service.connect("u1", INPUT, "token")).rejects.toMatchObject({ status: 400 });
      expect(accounts.save).not.toHaveBeenCalled();
    });

    it("ne rend pas au client le message brut du serveur de courrier", async () => {
      const mailbox = makeMailbox({
        verify: jest.fn().mockRejectedValue(new Error("yann@exemple.fr: LOGIN failed")),
      });
      const service = new MailService(makeRepository(), mailbox, KEY);

      await expect(service.connect("u1", INPUT, "token")).rejects.toMatchObject({
        message: expect.not.stringContaining("LOGIN"),
      });
    });

    it("refuse de relier une boîte quand la clé de chiffrement manque", async () => {
      const service = new MailService(makeRepository(), makeMailbox(), "");

      await expect(service.connect("u1", INPUT, "token")).rejects.toMatchObject({ status: 503 });
    });
  });

  describe("getAccount", () => {
    it("rend null quand aucune boîte n'est reliée", async () => {
      const service = new MailService(makeRepository(), makeMailbox(), KEY);

      expect(await service.getAccount("u1", "token")).toBeNull();
    });

    it("ne rend jamais le mot de passe chiffré", async () => {
      const accounts = makeRepository({ find: jest.fn().mockResolvedValue(stored("x.y.z")) });
      const service = new MailService(accounts, makeMailbox(), KEY);

      expect(await service.getAccount("u1", "token")).not.toHaveProperty("passwordEncrypted");
    });
  });

  describe("listMessages", () => {
    it("répond 404 quand aucune boîte n'est reliée", async () => {
      const service = new MailService(makeRepository(), makeMailbox(), KEY);

      await expect(service.listMessages("u1", "INBOX", "token")).rejects.toMatchObject({
        status: 404,
      });
    });

    it("ouvre la boîte avec le mot de passe déchiffré", async () => {
      const mailbox = makeMailbox();
      const service = new MailService(await repositoryWithAccount(), mailbox, KEY);

      await service.listMessages("u1", "INBOX", "token");

      expect(mailbox.listMessages).toHaveBeenCalledWith(
        { host: "ssl0.ovh.net", address: "yann@exemple.fr", password: "secret" },
        "INBOX",
        expect.any(Number),
      );
    });

    it("rend une erreur lisible quand la boîte ne répond pas", async () => {
      const mailbox = makeMailbox({
        listMessages: jest.fn().mockRejectedValue(new Error("ETIMEDOUT")),
      });
      const service = new MailService(await repositoryWithAccount(), mailbox, KEY);

      await expect(service.listMessages("u1", "INBOX", "token")).rejects.toMatchObject({
        status: 502,
      });
    });
  });

  describe("dossiers", () => {
    it("lit les messages du dossier demandé", async () => {
      const mailbox = makeMailbox();
      const service = new MailService(await repositoryWithAccount(), mailbox, KEY);

      await service.listMessages("u1", "INBOX.Sent", "token");

      expect(mailbox.listMessages).toHaveBeenCalledWith(
        expect.anything(),
        "INBOX.Sent",
        expect.any(Number),
      );
    });

    it("rend les dossiers de la boîte", async () => {
      const folders = [{ path: "INBOX", name: "Boîte de réception", depth: 0 }];
      const mailbox = makeMailbox({ listFolders: jest.fn().mockResolvedValue(folders) });
      const service = new MailService(await repositoryWithAccount(), mailbox, KEY);

      expect(await service.listFolders("u1", "token")).toEqual(folders);
    });

    it("répond 404 quand aucune boîte n'est reliée", async () => {
      const service = new MailService(makeRepository(), makeMailbox(), KEY);

      await expect(service.listFolders("u1", "token")).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("readMessage", () => {
    it("répond 404 quand le message n'existe plus", async () => {
      const service = new MailService(await repositoryWithAccount(), makeMailbox(), KEY);

      await expect(service.readMessage("u1", "INBOX", 7, "token")).rejects.toMatchObject({
        status: 404,
      });
    });

    it("rend le message lu", async () => {
      const message: MailMessage = {
        uid: 7,
        from: "a@b.fr",
        to: "yann@exemple.fr",
        subject: "Bonjour",
        date: null,
        seen: false,
        text: "Salut",
      };
      const mailbox = makeMailbox({ readMessage: jest.fn().mockResolvedValue(message) });
      const service = new MailService(await repositoryWithAccount(), mailbox, KEY);

      expect(await service.readMessage("u1", "INBOX", 7, "token")).toEqual(message);
    });
  });
});
