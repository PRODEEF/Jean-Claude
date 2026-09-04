/**
 * Décide si un message peut partir vers le moteur IA, à partir des compteurs
 * déjà en base pour l'utilisateur.
 *
 * Logique pure, sans dépendance à Supabase ni à l'horloge système : c'est ce
 * qui la rend testable sans base, et c'est elle qui porte la règle produit —
 * la fenêtre elle-même n'est pas une invariante structurelle de la table.
 */

/** Généreux pour un usage humain, assez bas pour arrêter un script emballé. */
export const RATE_LIMIT_PER_MINUTE = 20;
export const RATE_LIMIT_PER_HOUR = 300;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Compteurs des deux fenêtres, tels qu'ils sont stockés. */
export type RateLimitWindows = {
  minuteWindowStart: Date;
  minuteCount: number;
  hourWindowStart: Date;
  hourCount: number;
};

/** `null` pour un utilisateur jamais vu — premières fenêtres à ouvrir. */
export type RateLimitCounters = RateLimitWindows | null;

export type RateLimitDecision =
  | { allowed: true; next: RateLimitWindows }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Évalue puis met à jour les deux fenêtres.
 *
 * La fenêtre minute est vérifiée avant l'heure : un dépassement à la minute
 * est la forme la plus fréquente d'abus (rafale), autant le détecter au moins
 * coûteux des deux calculs.
 */
export function evaluateRateLimit(current: RateLimitCounters, now: Date): RateLimitDecision {
  const minute = advanceWindow(
    current ? { start: current.minuteWindowStart, count: current.minuteCount } : null,
    now,
    MINUTE_MS,
  );
  const hour = advanceWindow(
    current ? { start: current.hourWindowStart, count: current.hourCount } : null,
    now,
    HOUR_MS,
  );

  if (minute.count >= RATE_LIMIT_PER_MINUTE) {
    return { allowed: false, retryAfterSeconds: retryAfter(minute.start, MINUTE_MS, now) };
  }
  if (hour.count >= RATE_LIMIT_PER_HOUR) {
    return { allowed: false, retryAfterSeconds: retryAfter(hour.start, HOUR_MS, now) };
  }

  return {
    allowed: true,
    next: {
      minuteWindowStart: minute.start,
      minuteCount: minute.count + 1,
      hourWindowStart: hour.start,
      hourCount: hour.count + 1,
    },
  };
}

/** Fenêtre à jour : celle en cours si elle n'a pas expiré, sinon une neuve à zéro. */
function advanceWindow(
  window: { start: Date; count: number } | null,
  now: Date,
  durationMs: number,
): { start: Date; count: number } {
  if (window && now.getTime() - window.start.getTime() < durationMs) return window;
  return { start: now, count: 0 };
}

/** Au moins une seconde : un délai de 0 laisserait croire que la voie est libre. */
function retryAfter(windowStart: Date, durationMs: number, now: Date): number {
  const remainingMs = windowStart.getTime() + durationMs - now.getTime();
  return Math.max(1, Math.ceil(remainingMs / 1000));
}
