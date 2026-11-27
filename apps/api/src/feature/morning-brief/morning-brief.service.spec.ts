import type { BriefItem } from "./morning-brief.js";
import type { BriefWriter } from "./morning-brief-writer.js";
import type {
  BriefRecipient,
  IMorningBriefRepository,
} from "./morning-brief.repository.interface.js";
import { MorningBriefService } from "./morning-brief.service.js";

// 07:30 UTC = 08:30 à Paris : dans la plage du point du matin.
const MORNING = new Date("2026-11-25T07:30:00.000Z");
const LATE = new Date("2026-11-25T14:00:00.000Z");

const YANN: BriefRecipient = {
  userId: "user-1",
  timezone: "Europe/Paris",
  displayName: "Yann",
  assistantName: "Jean-Claude",
  memory: null,
  bounds: { afternoonFrom: 12, eveningFrom: 19 },
};

const KINE: BriefItem = {
  startsAt: "2026-11-25T13:00:00.000Z",
  allDay: false,
  title: "Kiné",
  list: false,
  done: false,
};

function makeRepository(overrides: Partial<IMorningBriefRepository> = {}): IMorningBriefRepository {
  return {
    // Seul le matin est activé d'office : l'après-midi et le soir sont sur demande.
    findRecipients: jest
      .fn()
      .mockImplementation((kind: string) => Promise.resolve(kind === "morning" ? [YANN] : [])),
    claim: jest.fn().mockResolvedValue(true),
    release: jest.fn().mockResolvedValue(undefined),
    agendaOf: jest.fn().mockResolvedValue([KINE]),
    postInChannel: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("MorningBriefService", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("écrit l'introduction puis la journée dans le canal", async () => {
    const repo = makeRepository();
    const write: BriefWriter = jest.fn().mockResolvedValue("Salut Yann, belle journée :");

    const run = await new MorningBriefService(repo, write).run(MORNING);

    expect(run).toEqual({ sent: 1, failed: 0 });
    expect(repo.postInChannel).toHaveBeenCalledWith(
      "user-1",
      "Salut Yann, belle journée :\n- 14h : Kiné",
    );
  });

  it("réserve un seul point par jour local", async () => {
    const repo = makeRepository({ claim: jest.fn().mockResolvedValue(false) });

    const run = await new MorningBriefService(repo).run(MORNING);

    expect(run).toEqual({ sent: 0, failed: 0 });
    expect(repo.claim).toHaveBeenCalledWith("user-1", "2026-11-25", "morning");
    expect(repo.postInChannel).not.toHaveBeenCalled();
  });

  it("n'envoie rien hors de la plage du matin", async () => {
    const repo = makeRepository();

    await new MorningBriefService(repo).run(LATE);

    expect(repo.claim).not.toHaveBeenCalled();
    expect(repo.postInChannel).not.toHaveBeenCalled();
  });

  it("ne dit rien d'une journée vide, sans la retenter", async () => {
    const repo = makeRepository({ agendaOf: jest.fn().mockResolvedValue([]) });

    const run = await new MorningBriefService(repo).run(MORNING);

    expect(run).toEqual({ sent: 0, failed: 0 });
    expect(repo.postInChannel).not.toHaveBeenCalled();
    expect(repo.release).not.toHaveBeenCalled();
  });

  it("retombe sur l'introduction fixe quand le modèle échoue", async () => {
    const repo = makeRepository();
    const write: BriefWriter = jest.fn().mockRejectedValue(new Error("panne"));

    const run = await new MorningBriefService(repo, write).run(MORNING);

    expect(run.sent).toBe(1);
    expect(repo.postInChannel).toHaveBeenCalledWith(
      "user-1",
      "Bonjour Yann, voici ta journée :\n- 14h : Kiné",
    );
  });

  it("rend la réservation quand l'écriture échoue, pour retenter au passage suivant", async () => {
    const repo = makeRepository({
      postInChannel: jest.fn().mockRejectedValue(new Error("base injoignable")),
    });

    const run = await new MorningBriefService(repo).run(MORNING);

    expect(run).toEqual({ sent: 0, failed: 1 });
    expect(repo.release).toHaveBeenCalledWith("user-1", "2026-11-25", "morning");
  });

  it("un échec pour l'un ne retient pas les autres", async () => {
    const other: BriefRecipient = { ...YANN, userId: "user-2", displayName: "Léa" };
    const repo = makeRepository({
      findRecipients: jest.fn().mockResolvedValue([YANN, other]),
      agendaOf: jest.fn().mockRejectedValueOnce(new Error("panne")).mockResolvedValueOnce([KINE]),
    });

    const run = await new MorningBriefService(repo).run(MORNING);

    expect(run).toEqual({ sent: 1, failed: 1 });
    expect(repo.postInChannel).toHaveBeenCalledWith("user-2", expect.stringContaining("Léa"));
  });

  describe("après-midi et soir", () => {
    // 12:30 à Paris = 11:30 UTC ; 19:30 à Paris = 18:30 UTC.
    const AFTERNOON = new Date("2026-11-25T11:30:00.000Z");
    const EVENING = new Date("2026-11-25T18:30:00.000Z");

    /** Une seule sorte de destinataire par point : l'après-midi et le soir n'arrivent que chez qui les a demandés. */
    function repoFor(kind: "afternoon" | "evening", agenda: BriefItem[] = [KINE]) {
      return makeRepository({
        findRecipients: jest
          .fn()
          .mockImplementation((asked: string) => Promise.resolve(asked === kind ? [YANN] : [])),
        agendaOf: jest.fn().mockResolvedValue(agenda),
      });
    }

    it("écrit au point de l'après-midi ce qu'il reste à faire", async () => {
      const repo = repoFor("afternoon");

      const run = await new MorningBriefService(repo).run(AFTERNOON);

      expect(run).toEqual({ sent: 1, failed: 0 });
      expect(repo.claim).toHaveBeenCalledWith("user-1", "2026-11-25", "afternoon");
      expect(repo.postInChannel).toHaveBeenCalledWith(
        "user-1",
        "Bon après-midi Yann, voici ce qu'il te reste à faire :\n- 14h : Kiné",
      );
    });

    it("dit que l'après-midi est calme au lieu de se taire", async () => {
      const repo = repoFor("afternoon", []);

      const run = await new MorningBriefService(repo).run(AFTERNOON);

      expect(run.sent).toBe(1);
      expect(repo.postInChannel).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("Après-midi calme"),
      );
    });

    it("écrit au point du soir le bilan, et lit aussi demain", async () => {
      const repo = repoFor("evening");

      const run = await new MorningBriefService(repo).run(EVENING);

      expect(run).toEqual({ sent: 1, failed: 0 });
      expect(repo.claim).toHaveBeenCalledWith("user-1", "2026-11-25", "evening");
      // Aujourd'hui, puis demain : deux lectures de l'agenda.
      expect(repo.agendaOf).toHaveBeenCalledTimes(2);
      expect(repo.postInChannel).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("Bilan : 0 fait sur 1."),
      );
    });

    it("dit que la soirée est calme quand ni aujourd'hui ni demain n'ont rien", async () => {
      const repo = repoFor("evening", []);

      await new MorningBriefService(repo).run(EVENING);

      expect(repo.postInChannel).toHaveBeenCalledWith(
        "user-1",
        expect.stringContaining("Soirée calme"),
      );
    });

    it("n'écrit pas l'après-midi hors de sa plage", async () => {
      const repo = repoFor("afternoon");

      await new MorningBriefService(repo).run(MORNING);

      expect(repo.claim).not.toHaveBeenCalled();
    });

    it("rend la réservation d'un point du soir qui n'a pas pu partir", async () => {
      const repo = repoFor("evening");
      (repo.postInChannel as jest.Mock).mockRejectedValue(new Error("base injoignable"));

      const run = await new MorningBriefService(repo).run(EVENING);

      expect(run).toEqual({ sent: 0, failed: 1 });
      expect(repo.release).toHaveBeenCalledWith("user-1", "2026-11-25", "evening");
    });

    it("le matin écarte ce qui est déjà fait", async () => {
      const repo = makeRepository({
        agendaOf: jest.fn().mockResolvedValue([{ ...KINE, list: true, done: true }]),
      });

      const run = await new MorningBriefService(repo).run(MORNING);

      expect(run).toEqual({ sent: 0, failed: 0 });
      expect(repo.postInChannel).not.toHaveBeenCalled();
    });
  });
});
