/** Longueur de l'aperçu sous l'objet : une ligne de liste, pas un paragraphe. */
export const PREVIEW_LENGTH = 120;

/**
 * Début lisible d'un mail, sur une ligne.
 *
 * Les lignes citées (`> …`, un mail auquel on répond), les adresses et les
 * espaces en trop sont retirés : ce qu'on veut lire sous l'objet, c'est ce que
 * l'expéditeur a écrit, pas ce qu'il cite ni les liens qu'il colle.
 */
export function previewOf(text: string | null | undefined): string {
  if (!text) return "";

  const own = text
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith(">"))
    .join(" ")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (own.length <= PREVIEW_LENGTH) return own;
  return `${own.slice(0, PREVIEW_LENGTH).trimEnd()}…`;
}
