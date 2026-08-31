/**
 * Extrait le jeton d'un en-tête `Authorization: Bearer <jeton>`.
 *
 * La séparation se fait sur une suite d'espaces quelconque, et non sur un
 * espace unique : la RFC 7235 en autorise plusieurs, et un client qui en
 * enverrait deux recevrait autrement un 401 sans rapport avec la validité de
 * son jeton — panne coûteuse à diagnostiquer.
 *
 * Un en-tête comportant un segment de trop est rejeté plutôt que tronqué : un
 * jeton ne contient pas d'espace, un tel en-tête est donc malformé, et deviner
 * n'a pas sa place sur un chemin d'authentification.
 */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;

  const [scheme, token, ...extra] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer") return null;
  if (!token || extra.length > 0) return null;

  return token;
}
