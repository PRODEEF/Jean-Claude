import {
  evaluateRateLimit,
  RATE_LIMIT_PER_HOUR,
  RATE_LIMIT_PER_MINUTE,
  type RateLimitWindows,
} from "./rate-limit-policy.js";

const NOW = new Date("2026-09-04T10:00:00.000Z");

function windows(overrides: Partial<RateLimitWindows> = {}): RateLimitWindows {
  return {
    minuteWindowStart: NOW,
    minuteCount: 0,
    hourWindowStart: NOW,
    hourCount: 0,
    ...overrides,
  };
}

describe("évaluation de la limite de débit", () => {
  it("autorise le premier message d'un utilisateur jamais vu", () => {
    const decision = evaluateRateLimit(null, NOW);
    expect(decision).toEqual({
      allowed: true,
      next: { minuteWindowStart: NOW, minuteCount: 1, hourWindowStart: NOW, hourCount: 1 },
    });
  });

  it("incrémente les deux fenêtres sur un message dans les clous", () => {
    const current = windows({ minuteCount: 3, hourCount: 40 });
    const decision = evaluateRateLimit(current, NOW);
    expect(decision).toEqual({
      allowed: true,
      next: { minuteWindowStart: NOW, minuteCount: 4, hourWindowStart: NOW, hourCount: 41 },
    });
  });

  it("remet à zéro la fenêtre minute expirée sans toucher à l'heure", () => {
    const oldMinute = new Date(NOW.getTime() - 61_000);
    const current = windows({
      minuteWindowStart: oldMinute,
      minuteCount: RATE_LIMIT_PER_MINUTE,
      hourCount: 10,
    });

    const decision = evaluateRateLimit(current, NOW);
    expect(decision).toEqual({
      allowed: true,
      next: { minuteWindowStart: NOW, minuteCount: 1, hourWindowStart: NOW, hourCount: 11 },
    });
  });

  it("remet à zéro les deux fenêtres quand l'heure a aussi expiré", () => {
    const oldStart = new Date(NOW.getTime() - 3_601_000);
    const current = windows({
      minuteWindowStart: oldStart,
      minuteCount: RATE_LIMIT_PER_MINUTE,
      hourWindowStart: oldStart,
      hourCount: RATE_LIMIT_PER_HOUR,
    });

    const decision = evaluateRateLimit(current, NOW);
    expect(decision).toEqual({
      allowed: true,
      next: { minuteWindowStart: NOW, minuteCount: 1, hourWindowStart: NOW, hourCount: 1 },
    });
  });

  it("refuse au-delà de la limite minute, avant même de regarder l'heure", () => {
    const current = windows({ minuteCount: RATE_LIMIT_PER_MINUTE, hourCount: 5 });
    const decision = evaluateRateLimit(current, NOW);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.retryAfterSeconds).toBe(60);
  });

  it("refuse au-delà de la limite heure alors que la minute est dans les clous", () => {
    const hourStart = new Date(NOW.getTime() - 30 * 60_000);
    const current = windows({ minuteCount: 1, hourWindowStart: hourStart, hourCount: RATE_LIMIT_PER_HOUR });
    const decision = evaluateRateLimit(current, NOW);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.retryAfterSeconds).toBe(30 * 60);
  });

  it("indique un délai d'au moins une seconde avant de pouvoir réessayer", () => {
    const almostExpired = new Date(NOW.getTime() - 59_999);
    const current = windows({ minuteWindowStart: almostExpired, minuteCount: RATE_LIMIT_PER_MINUTE });
    const decision = evaluateRateLimit(current, NOW);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});
