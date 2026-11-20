import {
  ARCHIVE_NAMES,
  pickFolder,
  presentFolders,
  TRASH_NAMES,
  type RawFolder,
} from "./folders.js";

function folder(path: string, overrides: Partial<RawFolder> = {}): RawFolder {
  return { path, name: path, selectable: true, unseen: 0, ...overrides };
}

describe("presentFolders", () => {
  it("met la boîte de réception en tête, puis les dossiers usuels dans l'ordre", () => {
    const result = presentFolders([
      folder("Trash", { specialUse: "\\Trash" }),
      folder("Sent", { specialUse: "\\Sent" }),
      folder("INBOX"),
      folder("Drafts", { specialUse: "\\Drafts" }),
    ]);

    expect(result.map((entry) => entry.name)).toEqual([
      "Boîte de réception",
      "Brouillons",
      "Envoyés",
      "Corbeille",
    ]);
  });

  it("nomme un dossier d'après son rôle, pas d'après son nom d'origine", () => {
    const result = presentFolders([folder("Éléments envoyés", { specialUse: "\\Sent" })]);

    expect(result).toEqual([{ path: "Éléments envoyés", name: "Envoyés", depth: 0, unseen: 0 }]);
  });

  it("garde le chemin d'origine, qui sert à ouvrir le dossier", () => {
    const result = presentFolders([folder("INBOX.Sent", { specialUse: "\\Sent" })]);

    expect(result[0]?.path).toBe("INBOX.Sent");
  });

  it("range les dossiers personnels après les usuels, par ordre alphabétique", () => {
    const result = presentFolders([folder("Voyages"), folder("INBOX"), folder("Banque")]);

    expect(result.map((entry) => entry.name)).toEqual(["Boîte de réception", "Banque", "Voyages"]);
  });

  it("écarte ce qui n'est qu'un conteneur de sous-dossiers", () => {
    const result = presentFolders([folder("INBOX"), folder("Archives", { selectable: false })]);

    expect(result.map((entry) => entry.path)).toEqual(["INBOX"]);
  });

  it("rend une liste vide quand il n'y a aucun dossier", () => {
    expect(presentFolders([])).toEqual([]);
  });

  it("garde chaque sous-dossier sous son parent, avec son niveau", () => {
    const result = presentFolders([
      folder("PRODEEF/CLIENT", { name: "CLIENT", delimiter: "/" }),
      folder("PRODEEF", { delimiter: "/" }),
      folder("PERSO", { delimiter: "/" }),
      folder("PRODEEF/CLIENT/ACME", { name: "ACME", delimiter: "/" }),
    ]);

    expect(result.map((entry) => [entry.name, entry.depth])).toEqual([
      ["PERSO", 0],
      ["PRODEEF", 0],
      ["CLIENT", 1],
      ["ACME", 2],
    ]);
  });

  it("compte depuis la boîte de réception ce qui est rangé dessous", () => {
    const result = presentFolders([
      folder("INBOX", { delimiter: "." }),
      folder("INBOX.Banque", { name: "Banque", delimiter: "." }),
      folder("INBOX.Sent", { name: "Sent", delimiter: ".", specialUse: "\\Sent" }),
    ]);

    expect(result.map((entry) => [entry.name, entry.depth])).toEqual([
      ["Boîte de réception", 0],
      ["Envoyés", 0],
      ["Banque", 0],
    ]);
  });

  it("garde le nombre de mails non lus de chaque dossier", () => {
    const result = presentFolders([
      folder("INBOX", { unseen: 12 }),
      folder("Banque", { unseen: 3 }),
    ]);

    expect(result.map((entry) => entry.unseen)).toEqual([12, 3]);
  });
});

describe("pickFolder", () => {
  it("prend le dossier que le serveur annonce comme corbeille, quel que soit son nom", () => {
    const folders = [folder("INBOX"), folder("Éléments supprimés", { specialUse: "\\Trash" })];

    expect(pickFolder(folders, "\\Trash", TRASH_NAMES)).toBe("Éléments supprimés");
  });

  it("à défaut de rôle, cherche un nom usuel sans tenir compte de la casse", () => {
    const folders = [folder("INBOX"), folder("TRASH")];

    expect(pickFolder(folders, "\\Trash", TRASH_NAMES)).toBe("TRASH");
  });

  it("préfère le rôle au nom", () => {
    const folders = [folder("Trash"), folder("Poubelle", { specialUse: "\\Trash" })];

    expect(pickFolder(folders, "\\Trash", TRASH_NAMES)).toBe("Poubelle");
  });

  it("rend null quand la boîte n'a ni corbeille ni dossier de ce nom", () => {
    expect(pickFolder([folder("INBOX")], "\\Trash", TRASH_NAMES)).toBeNull();
  });

  it("ignore un dossier qu'on ne peut pas ouvrir", () => {
    const folders = [folder("Archives", { selectable: false })];

    expect(pickFolder(folders, "\\Archive", ARCHIVE_NAMES)).toBeNull();
  });

  it("retrouve les archives", () => {
    const folders = [folder("INBOX"), folder("Archives")];

    expect(pickFolder(folders, "\\Archive", ARCHIVE_NAMES)).toBe("Archives");
  });
});
