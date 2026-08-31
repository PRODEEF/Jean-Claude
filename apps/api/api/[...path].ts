import { handle } from "hono/vercel";
import { app } from "../src/app";

/**
 * Point d'entrée serverless.
 *
 * Le nom `[...path]` fait tomber `/api/health` directement sur cette fonction :
 * le préfixe `/api` de l'application coïncide avec la convention Vercel, il n'y
 * a donc aucune réécriture à configurer.
 *
 * Ce fichier vit hors de `src/`, donc hors du `tsc` du dépôt — c'est Vercel qui
 * le compile. Le garder à trois lignes est délibéré : tout ce qui a besoin
 * d'être typé et testé reste dans `src/`.
 */
export default handle(app);
