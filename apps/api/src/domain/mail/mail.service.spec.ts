import { randomBytes } from "node:crypto";
import type { MailAccount } from "@jc/domain";
import type { IMailbox, MailboxSummary } from "../../core/mail/mailbox.js";
import { decryptSecret } from "../../core/mail/secret-box.js";
import type { IMailRepository, StoredMailAccount } from "./mail.repository.interface.js";
import { MailService } from "./mail.service.js";

const KEY = randomBytes(32).toString("base64");

const OVH = { address: "yann@exemple.fr", password: "secret", host: "ssl0.ovh.net" };
const PAGE = { limit: 30 };
const INFOMANIAK = { address: "yann@autre.ch", password: "autre", host: "mail.infomaniak.com" };

/** Dépôt en mémoire : il suit la logique d'une vraie table (une ligne par adresse). */
function makeRepository(overrides: Partial<IMailRepository> = {}): IMailRepository {
  const rows: StoredMailAccount[] = [];
  return {
    list: jest.fn().mockImplementation(async () => [...rows]),
    findById: jest
      .fn()
      .mockImplementation(
        async (_userId: string, id: string) => rows.find((r) => r.id === id) ?? null,
      ),
    save: jest.fn().mockImplementation(async (_userId: string, input) => {
      const found = rows.find((r) => r.address === input.address);
      const row: StoredMailAccount = {
        id: found?.id ?? `00000000-0000-4000-8000-00000000000${rows.length + 1}`,
        address: input.address,
        host: input.host,
        createdAt: "2026-11-20T09:00:00.000Z",
        passwordEncrypted: input.passwordEncrypted,
      };
      if (found) rows[rows.indexOf(found)] = row;
      else rows.push(row);
      const { passwordEncrypted: _hidden, ...account } = row;
      return account as MailAccount;
    }),
    remove: jest.fn().mockImplementation(async (_userId: string, id: string) => {
      const index = rows.findIndex((r) => r.id === id);
      if (index >= 0) rows.splice(index, 1);
    }),
    ...overrides,
  };
}

function makeMailbox(overrides: Partial<IMailbox> = {}): IMailbox {
  return {
    verify: jest.fn().mockResolvedValue(undefined),
    listFolders: jest.fn().mockResolvedValue([]),
    listMessages: jest.fn().mockResolvedValue([]),
    readMessage: jest.fn().mockResolvedValue(null),
    setSeen: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function summary(uid: number, date: string | null): MailboxSummary {
  return { uid, from: "a@b.fr", subject: `Mail ${uid}`, date, seen: false, preview: "" };
}

describe("MailService", () => {
  describe("connect", () => {
    it("vérifie la boîte puis garde le mot de passe chiffré, jamais en clair", async () => {
      const accounts = makeRepository();
      const service = new MailService(accounts, makeMailbox(), KEY);

      const account = await service.connect("u1", OVH, "token");

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

      await expect(service.connect("u1", OVH, "token")).rejects.toMatchObject({ status: 400 });
      expect(accounts.save).not.toHaveBeenCalled();
    });

    it("ne rend pas au client le message brut du serveur de courrier", async () => {
      const mailbox = makeMailbox({
        verify: jest.fn().mockRejectedValue(new Error("yann@exemple.fr: LOGIN failed")),
      });
      const service = new MailService(makeRepository(), mailbox, KEY);

      await expect(service.connect("u1", OVH, "token")).rejects.toMatchObject({
        message: expect.not.stringContaining("LOGIN"),
      });
    });

    it("refuse de relier une boîte quand la clé de chiffrement manque", async () => {
      const service = new MailService(makeRepository(), makeMailbox(), "");

      await expect(service.connect("u1", OVH, "token")).rejects.toMatchObject({ status: 503 });
    });

    it("relie une deuxième boîte sans toucher à la première", async () => {
      const accounts = makeRepository();
      const service = new MailService(accounts, makeMailbox(), KEY);

      await service.connect("u1", OVH, "token");
      await service.connect("u1", INFOMANIAK, "token");

      expect((await service.listAccounts("u1", "token")).map((a) => a.address)).toEqual([
        "yann@exemple.fr",
        "yann@autre.ch",
      ]);
    });

    it("relier à nouveau la même adresse la remplace au lieu d'en ajouter une", async () => {
      const service = new MailService(makeRepository(), makeMailbox(), KEY);

      await service.connect("u1", OVH, "token");
      await service.connect("u1", { ...OVH, password: "nouveau" }, "token");

      expect(await service.listAccounts("u1", "token")).toHaveLength(1);
    });

    it("refuse une sixième boîte", async () => {
      const service = new MailService(makeRepository(), makeMailbox(), KEY);
      for (let i = 1; i <= 5; i++) {
        await service.connect("u1", { ...OVH, address: `boite${i}@exemple.fr` }, "token");
      }

      await expect(
        service.connect("u1", { ...OVH, address: "boite6@exemple.fr" }, "token"),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("laisse relier à nouveau une boîte quand la limite est atteinte", async () => {
      const service = new MailService(makeRepository(), makeMailbox(), KEY);
      for (let i = 1; i <= 5; i++) {
        await service.connect("u1", { ...OVH, address: `boite${i}@exemple.fr` }, "token");
      }

      await expect(
        service.connect("u1", { ...OVH, address: "boite3@exemple.fr", password: "neuf" }, "token"),
      ).resolves.toBeDefined();
    });
  });

  describe("listAccounts", () => {
    it("rend une liste vide quand aucune boîte n'est reliée", async () => {
      const service = new MailService(makeRepository(), makeMailbox(), KEY);

      expect(await service.listAccounts("u1", "token")).toEqual([]);
    });

    it("ne rend jamais le mot de passe chiffré", async () => {
      const service = new MailService(makeRepository(), makeMailbox(), KEY);
      await service.connect("u1", OVH, "token");

      for (const account of await service.listAccounts("u1", "token")) {
        expect(account).not.toHaveProperty("passwordEncrypted");
      }
    });
  });

  describe("disconnect", () => {
    it("retire la boîte demandée et garde les autres", async () => {
      const service = new MailService(makeRepository(), makeMailbox(), KEY);
      const first = await service.connect("u1", OVH, "token");
      await service.connect("u1", INFOMANIAK, "token");

      await service.disconnect("u1", first.id, "token");

      expect((await service.listAccounts("u1", "token")).map((a) => a.address)).toEqual([
        "yann@autre.ch",
      ]);
    });
  });

  describe("dossiers", () => {
    it("répond 404 quand la boîte n'existe pas", async () => {
      const service = new MailService(makeRepository(), makeMailbox(), KEY);

      await expect(service.listFolders("u1", "inconnue", "token")).rejects.toMatchObject({
        status: 404,
      });
    });

    it("rend les dossiers de la boîte avec leurs non lus", async () => {
      const folders = [{ path: "INBOX", name: "Boîte de réception", depth: 0, unseen: 4 }];
      const mailbox = makeMailbox({ listFolders: jest.fn().mockResolvedValue(folders) });
      const service = new MailService(makeRepository(), mailbox, KEY);
      const account = await service.connect("u1", OVH, "token");

      expect(await service.listFolders("u1", account.id, "token")).toEqual(folders);
    });

    it("ouvre la boîte avec le mot de passe déchiffré de CETTE boîte", async () => {
      const mailbox = makeMailbox();
      const service = new MailService(makeRepository(), mailbox, KEY);
      await service.connect("u1", OVH, "token");
      const second = await service.connect("u1", INFOMANIAK, "token");

      await service.listFolders("u1", second.id, "token");

      expect(mailbox.listFolders).toHaveBeenCalledWith({
        host: "mail.infomaniak.com",
        address: "yann@autre.ch",
        password: "autre",
      });
    });
  });

  describe("listMessages", () => {
    it("lit les messages du dossier demandé et les rattache à leur boîte", async () => {
      const mailbox = makeMailbox({
        listMessages: jest.fn().mockResolvedValue([summary(5, "2026-11-19T10:00:00.000Z")]),
      });
      const service = new MailService(makeRepository(), mailbox, KEY);
      const account = await service.connect("u1", OVH, "token");

      const messages = await service.listMessages("u1", account.id, "INBOX.Sent", PAGE, "token");

      expect(mailbox.listMessages).toHaveBeenCalledWith(
        expect.objectContaining({ address: "yann@exemple.fr" }),
        "INBOX.Sent",
        PAGE,
      );
      expect(messages[0]?.accountId).toBe(account.id);
    });

    it("rend une erreur lisible quand la boîte ne répond pas", async () => {
      const mailbox = makeMailbox({
        listMessages: jest.fn().mockRejectedValue(new Error("ETIMEDOUT")),
      });
      const service = new MailService(makeRepository(), mailbox, KEY);
      const account = await service.connect("u1", OVH, "token");

      await expect(
        service.listMessages("u1", account.id, "INBOX", PAGE, "token"),
      ).rejects.toMatchObject({
        status: 502,
      });
    });
  });

  describe("recherche et non lus", () => {
    it("transmet la recherche, le filtre non lus et le nombre demandé à la boîte", async () => {
      const mailbox = makeMailbox();
      const service = new MailService(makeRepository(), mailbox, KEY);
      const account = await service.connect("u1", OVH, "token");
      const options = { limit: 60, query: "facture", unseenOnly: true };

      await service.listMessages("u1", account.id, "INBOX", options, "token");

      expect(mailbox.listMessages).toHaveBeenCalledWith(expect.anything(), "INBOX", options);
    });

    it("applique la recherche à chaque boîte de la boîte de réception commune", async () => {
      const mailbox = makeMailbox();
      const service = new MailService(makeRepository(), mailbox, KEY);
      await service.connect("u1", OVH, "token");
      await service.connect("u1", INFOMANIAK, "token");
      const options = { limit: 30, query: "facture" };

      await service.listAllInbox("u1", options, "token");

      expect(mailbox.listMessages).toHaveBeenCalledTimes(2);
      for (const call of (mailbox.listMessages as jest.Mock).mock.calls) {
        expect(call[2]).toEqual(options);
      }
    });

    it("ne rend pas plus de mails que demandé quand plusieurs boîtes répondent", async () => {
      const mailbox = makeMailbox({
        listMessages: jest
          .fn()
          .mockResolvedValue([
            summary(3, "2026-11-20T10:00:00.000Z"),
            summary(2, "2026-11-19T10:00:00.000Z"),
            summary(1, "2026-11-18T10:00:00.000Z"),
          ]),
      });
      const service = new MailService(makeRepository(), mailbox, KEY);
      await service.connect("u1", OVH, "token");
      await service.connect("u1", INFOMANIAK, "token");

      const inbox = await service.listAllInbox("u1", { limit: 4 }, "token");

      expect(inbox.messages).toHaveLength(4);
    });
  });

  describe("setSeen", () => {
    it("marque le mail lu ou non lu dans la bonne boîte et le bon dossier", async () => {
      const mailbox = makeMailbox();
      const service = new MailService(makeRepository(), mailbox, KEY);
      const account = await service.connect("u1", OVH, "token");

      await service.setSeen("u1", account.id, "INBOX.Banque", 7, false, "token");

      expect(mailbox.setSeen).toHaveBeenCalledWith(
        expect.objectContaining({ address: "yann@exemple.fr" }),
        "INBOX.Banque",
        7,
        false,
      );
    });

    it("répond 404 quand la boîte n'existe pas", async () => {
      const service = new MailService(makeRepository(), makeMailbox(), KEY);

      await expect(
        service.setSeen("u1", "inconnue", "INBOX", 7, true, "token"),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("rend une erreur lisible quand la boîte ne répond pas", async () => {
      const mailbox = makeMailbox({ setSeen: jest.fn().mockRejectedValue(new Error("ETIMEDOUT")) });
      const service = new MailService(makeRepository(), mailbox, KEY);
      const account = await service.connect("u1", OVH, "token");

      await expect(
        service.setSeen("u1", account.id, "INBOX", 7, true, "token"),
      ).rejects.toMatchObject({ status: 502 });
    });
  });

  describe("listAllInbox", () => {
    it("réunit les boîtes de réception, les plus récents d'abord", async () => {
      const mailbox = makeMailbox({
        listMessages: jest
          .fn()
          .mockImplementation(async (credentials) =>
            credentials.address === "yann@exemple.fr"
              ? [summary(1, "2026-11-18T10:00:00.000Z"), summary(2, "2026-11-20T10:00:00.000Z")]
              : [summary(1, "2026-11-19T10:00:00.000Z")],
          ),
      });
      const service = new MailService(makeRepository(), mailbox, KEY);
      const first = await service.connect("u1", OVH, "token");
      const second = await service.connect("u1", INFOMANIAK, "token");

      const inbox = await service.listAllInbox("u1", PAGE, "token");

      expect(inbox.messages.map((m) => [m.accountId, m.uid])).toEqual([
        [first.id, 2],
        [second.id, 1],
        [first.id, 1],
      ]);
      expect(inbox.unreachableAccountIds).toEqual([]);
    });

    it("signale une boîte injoignable sans cacher les autres", async () => {
      const mailbox = makeMailbox({
        listMessages: jest.fn().mockImplementation(async (credentials) => {
          if (credentials.address === "yann@autre.ch") throw new Error("ETIMEDOUT");
          return [summary(1, "2026-11-19T10:00:00.000Z")];
        }),
      });
      const service = new MailService(makeRepository(), mailbox, KEY);
      const first = await service.connect("u1", OVH, "token");
      const second = await service.connect("u1", INFOMANIAK, "token");

      const inbox = await service.listAllInbox("u1", PAGE, "token");

      expect(inbox.messages.map((m) => m.accountId)).toEqual([first.id]);
      expect(inbox.unreachableAccountIds).toEqual([second.id]);
    });

    it("range un mail sans date après les autres", async () => {
      const mailbox = makeMailbox({
        listMessages: jest
          .fn()
          .mockResolvedValue([summary(1, null), summary(2, "2026-11-19T10:00:00.000Z")]),
      });
      const service = new MailService(makeRepository(), mailbox, KEY);
      await service.connect("u1", OVH, "token");

      const inbox = await service.listAllInbox("u1", PAGE, "token");

      expect(inbox.messages.map((m) => m.uid)).toEqual([2, 1]);
    });

    it("rend une boîte de réception vide quand aucune boîte n'est reliée", async () => {
      const service = new MailService(makeRepository(), makeMailbox(), KEY);

      expect(await service.listAllInbox("u1", PAGE, "token")).toEqual({
        messages: [],
        unreachableAccountIds: [],
      });
    });
  });

  describe("readMessage", () => {
    it("répond 404 quand le message n'existe plus", async () => {
      const service = new MailService(makeRepository(), makeMailbox(), KEY);
      const account = await service.connect("u1", OVH, "token");

      await expect(
        service.readMessage("u1", account.id, "INBOX", 7, "token"),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("rend le message lu, rattaché à sa boîte", async () => {
      const mailbox = makeMailbox({
        readMessage: jest.fn().mockResolvedValue({
          uid: 7,
          from: "a@b.fr",
          to: "yann@exemple.fr",
          subject: "Bonjour",
          date: null,
          seen: false,
          text: "Salut",
        }),
      });
      const service = new MailService(makeRepository(), mailbox, KEY);
      const account = await service.connect("u1", OVH, "token");

      const message = await service.readMessage("u1", account.id, "INBOX", 7, "token");

      expect(message).toMatchObject({ uid: 7, text: "Salut", accountId: account.id });
    });
  });
});
