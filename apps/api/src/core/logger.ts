/**
 * Point de passage unique pour les journaux serveur.
 *
 * Les fonctions serverless de Vercel collectent déjà la sortie standard : ce
 * qui manquait n'était pas un transport, mais un préfixe homogène — sans lui,
 * un message d'un module ne se distingue pas de celui d'un autre une fois le
 * volume réel atteint.
 */
export const logger = {
  warn(scope: string, message: string, detail?: unknown): void {
    if (detail !== undefined) console.warn(`[${scope}] ${message}`, detail);
    else console.warn(`[${scope}] ${message}`);
  },

  error(scope: string, message: string, detail?: unknown): void {
    if (detail !== undefined) console.error(`[${scope}] ${message}`, detail);
    else console.error(`[${scope}] ${message}`);
  },
};
