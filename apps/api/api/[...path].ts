import { app } from "../src/app.js";

/**
 * Point d'entrée serverless.
 *
 * Le nom `[...path]` fait tomber `/api/health` directement sur cette fonction :
 * le préfixe `/api` de l'application coïncide avec la convention Vercel, il n'y
 * a donc aucune réécriture à configurer.
 *
 * L'export est un **objet portant `fetch`**, et non une fonction. C'est ce qui
 * décide de la signature côté Vercel : une fonction exportée est traitée comme
 * un handler Node et reçoit un `IncomingMessage`, dont `headers` est un objet
 * nu — `app.fetch()` y appellerait `headers.get()` et lèverait. Un objet à
 * `fetch` fait passer Vercel sur son chemin Web standard, qui fournit une vraie
 * `Request`. C'est aussi pourquoi `handle` de `hono/vercel` ne convient pas
 * ici : il est écrit pour le App Router de Next.js, où la plateforme construit
 * déjà la `Request`.
 *
 * Ce fichier vit hors de `src/`, donc hors du `tsc` du dépôt — c'est Vercel qui
 * le compile. Le garder minimal est délibéré : tout ce qui a besoin d'être typé
 * et testé reste dans `src/`.
 */
export default {
  fetch: (request: Request): Response | Promise<Response> => app.fetch(request),
};
