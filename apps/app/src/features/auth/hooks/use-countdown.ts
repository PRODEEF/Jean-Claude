import { useCallback, useEffect, useState } from "react";

export type Countdown = {
  /** Secondes restantes ; `0` quand le compte à rebours est terminé. */
  remaining: number;
  start: (seconds: number) => void;
  reset: () => void;
};

/**
 * Compte à rebours en secondes.
 *
 * Réarmé par `setTimeout` à chaque décrément plutôt que piloté par un
 * `setInterval` conservé dans une ref : le minuteur s'annule alors de lui-même
 * au démontage et à chaque changement d'état, sans nettoyage manuel à oublier.
 * La dérive de quelques millisecondes est sans conséquence pour un délai
 * d'attente affiché à la seconde.
 */
export function useCountdown(): Countdown {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((current) => current - 1), 1_000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const start = useCallback((seconds: number) => setRemaining(seconds), []);
  const reset = useCallback(() => setRemaining(0), []);

  return { remaining, start, reset };
}
