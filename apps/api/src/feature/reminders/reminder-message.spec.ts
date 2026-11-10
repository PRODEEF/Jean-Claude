import { reminderMessage } from "./reminder-message.js";

const BASE = {
  title: "Kiné",
  startsAt: "2026-11-12T17:00:00.000Z",
  allDay: false,
  reminderMinutesBefore: 30,
  timezone: "Europe/Paris",
};

describe("reminderMessage", () => {
  it("écrit l'heure dans le fuseau de l'utilisateur", () => {
    // 17h UTC en novembre : 18h à Paris.
    expect(reminderMessage(BASE)).toBe("Rappel : Kiné, à 18h (dans 30 minutes).");
  });

  it("affiche les minutes quand l'heure n'est pas ronde", () => {
    expect(reminderMessage({ ...BASE, startsAt: "2026-11-12T17:30:00.000Z" })).toBe(
      "Rappel : Kiné, à 18h30 (dans 30 minutes).",
    );
  });

  it("dit le délai en heures ou en jours quand il est rond", () => {
    expect(reminderMessage({ ...BASE, reminderMinutesBefore: 120 })).toContain("dans 2 heures");
    expect(reminderMessage({ ...BASE, reminderMinutesBefore: 1_440 })).toContain("dans 1 jour");
    expect(reminderMessage({ ...BASE, reminderMinutesBefore: 2_880 })).toContain("dans 2 jours");
  });

  it("dit « c'est maintenant » pour un rappel au début", () => {
    expect(reminderMessage({ ...BASE, reminderMinutesBefore: 0 })).toBe(
      "Rappel : Kiné, c'est maintenant (18h).",
    );
  });

  it("nomme le jour d'un rendez-vous sur la journée", () => {
    expect(reminderMessage({ ...BASE, allDay: true, startsAt: "2026-11-11T23:00:00.000Z" })).toBe(
      "Rappel : Kiné, jeudi 12 novembre.",
    );
  });
});
