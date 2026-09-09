import { parseSlashCommand, SLASH_COMMANDS } from "./command.schema";

describe("parseSlashCommand", () => {
  it("reconnaît chacune des commandes déclarées dans le catalogue", () => {
    for (const command of SLASH_COMMANDS) {
      expect(parseSlashCommand(`/${command.name} un argument`)).toEqual({
        name: command.name,
        args: "un argument",
      });
    }
  });

  it("reconnaît /todo et distingue son nom de ses arguments", () => {
    expect(parseSlashCommand("/todo liste de courses samedi")).toEqual({
      name: "todo",
      args: "liste de courses samedi",
    });
  });

  it("reconnaît /aide sans rien après le nom", () => {
    expect(parseSlashCommand("/aide")).toEqual({ name: "aide", args: "" });
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
