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
};

const KINE: BriefItem = {
  startsAt: "2026-11-25T13:00:00.000Z",
  allDay: false,
  title: "Kiné",
  list: false,
};

function makeRepository(overrides: Partial<IMorningBriefRepository> = {}): IMorningBriefRepository {
  return {
    findRecipients: jest.fn().mockResolvedValue([YANN]),
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
    expect(repo.claim).toHaveBeenCalledWith("user-1", "2026-11-25");
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
    expect(repo.release).toHaveBeenCalledWith("user-1", "2026-11-25");
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
});
