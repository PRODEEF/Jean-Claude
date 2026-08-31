/**
 * Décide si une origine est autorisée à appeler l'API.
 *
 * Une entrée de `CORS_ORIGIN` peut porter un joker :
 * `https://jean-claude-web-*.vercel.app` couvre les URL de preview Vercel,
 * dont le nom est tiré au sort à chaque déploiement. Sans lui, une preview du
 * web ne pourrait jamais joindre l'API — et les previews sont la principale
 * raison d'être des déploiements par branche.
 *
 * Le joker ne remplace qu'un seul segment, sans point. Cette borne n'est pas
 * cosmétique : sans elle, le motif ci-dessus accepterait aussi
 * `https://jean-claude-web-x.attaquant.vercel.app`, un sous-domaine que
 * n'importe qui peut faire pointer où il veut.
 */
export function isAllowedOrigin(origin: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matches(pattern.trim(), origin));
}

function matches(pattern: string, origin: string): boolean {
  const star = pattern.indexOf("*");
  if (star === -1) return pattern === origin;

  const head = pattern.slice(0, star);
  const tail = pattern.slice(star + 1);

  // Écarte au passage le joker vide : `https://jean-claude-web-.vercel.app`
  // n'est l'URL de personne.
  if (origin.length <= head.length + tail.length) return false;
  if (!origin.startsWith(head) || !origin.endsWith(tail)) return false;

  return !origin.slice(head.length, origin.length - tail.length).includes(".");
}
