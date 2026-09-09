import { parseSlashCommand } from "./command.schema";

describe("parseSlashCommand", () => {
  it("reconnaît /todo et distingue son nom de ses arguments", () => {
    expect(parseSlashCommand("/todo liste de courses samedi")).toEqual({
      name: "todo",
      args: "liste de courses samedi",
    });
  });

  it("reconnaît /help sans rien après le nom", () => {
    expect(parseSlashCommand("/help")).toEqual({ name: "help", args: "" });
  });

  it("ignore les espaces superflus autour du nom et des arguments", () => {
    expect(parseSlashCommand("  /todo   courses samedi  ")).toEqual({
      name: "todo",
      args: "courses samedi",
    });
  });

  it("reconnaît une commande quelle que soit la casse", () => {
    expect(parseSlashCommand("/TODO Courses")).toEqual({ name: "todo", args: "Courses" });
  });

  it("laisse une commande inconnue comme un message ordinaire", () => {
    expect(parseSlashCommand("/inexistante quelque chose")).toBeNull();
  });

  it("laisse un message qui ne commence pas par une barre", () => {
    expect(parseSlashCommand("Bonjour, /todo ne compte pas ici")).toBeNull();
  });

  it("laisse un message vide", () => {
    expect(parseSlashCommand("")).toBeNull();
  });
});
