import { describeEventChange, formatMoment } from "./workspace-event.schema";

const PARIS = "Europe/Paris";
const reunion = {
  title: "Réunion",
  startsAt: "2026-10-01T16:00:00.000Z",
  endsAt: "2026-10-01T17:30:00.000Z",
  allDay: false,
};

describe("formatMoment", () => {
  it("écrit le jour et l'horaire dans le fuseau donné", () => {
    expect(formatMoment(reunion, PARIS)).toBe("jeudi 1er octobre, 18 h – 19 h 30");
  });

  it("ne donne que le jour pour un événement sur la journée", () => {
    expect(formatMoment({ ...reunion, allDay: true }, PARIS)).toBe(
      "jeudi 1er octobre, toute la journée",
    );
  });

  it("n'écrit pas de fin quand il n'y en a pas", () => {
    expect(formatMoment({ ...reunion, endsAt: null }, PARIS)).toBe("jeudi 1er octobre, 18 h");
  });

  it("suit le fuseau de l'auteur, pas celui du serveur", () => {
    expect(formatMoment({ ...reunion, endsAt: null }, "America/Montreal")).toBe(
      "jeudi 1er octobre, 12 h",
    );
  });
});

describe("describeEventChange", () => {
  it("annonce un ajout avec son moment", () => {
    expect(describeEventChange("Clarisse", { kind: "created", event: reunion }, PARIS)).toBe(
      "Clarisse a ajouté « Réunion » au calendrier : jeudi 1er octobre, 18 h – 19 h 30.",
    );
  });

  it("dit « déplacé » quand le moment change", () => {
    const moved = { ...reunion, startsAt: "2026-10-02T16:00:00.000Z", endsAt: null };
    expect(
      describeEventChange("Bruno", { kind: "updated", event: moved, before: reunion }, PARIS),
    ).toBe("Bruno a déplacé « Réunion » au vendredi 2 octobre, 18 h.");
  });

  it("dit « modifié » quand seul le titre ou les notes changent", () => {
    const renamed = { ...reunion, title: "Réunion de bureau" };
    expect(
      describeEventChange("Bruno", { kind: "updated", event: renamed, before: reunion }, PARIS),
    ).toBe("Bruno a modifié « Réunion de bureau » : jeudi 1er octobre, 18 h – 19 h 30.");
  });

  it("annonce un retrait", () => {
    expect(describeEventChange("Alice", { kind: "deleted", event: reunion }, PARIS)).toBe(
      "Alice a retiré « Réunion » du calendrier.",
    );
  });
});
