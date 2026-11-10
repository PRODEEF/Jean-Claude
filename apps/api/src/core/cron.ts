import { timingSafeEqual } from "node:crypto";

/**
 * L'en-tête `Authorization` porte-t-il le secret du planificateur ?
 *
 * Comparaison en temps constant : un secret deviné octet par octet à la durée
 * de la réponse ouvrirait un traitement qui écrit dans les canaux de tout le
 * monde. Un secret vide n'ouvre jamais rien — le planificateur est alors
 * simplement désactivé.
 */
export function bearerMatches(header: string | undefined, secret: string): boolean {
  if (secret.length === 0 || header === undefined) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);

  return expected.length === received.length && timingSafeEqual(expected, received);
}
