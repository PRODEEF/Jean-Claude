import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { validator } from "hono/validator";
import type { z } from "zod";

/** Forme unique des erreurs sortantes — la seule que les clients ont à lire. */
export type ApiErrorBody = {
  statusCode: number;
  message: string;
  /** Erreurs de validation par champ, quand la requête a été rejetée par Zod. */
  errors?: Record<string, string[]>;
};

/**
 * Construit une erreur HTTP présentable au client.
 *
 * Le corps est fabriqué ici plutôt que dans le gestionnaire global : c'est ce
 * qui garantit qu'une erreur remontée depuis un service porte déjà un message
 * destiné à l'utilisateur, et qu'aucun détail interne — trace, requête SQL,
 * fragment de prompt — ne peut franchir la frontière par accident.
 */
export function httpError(
  status: ContentfulStatusCode,
  message: string,
  errors?: Record<string, string[]>,
): HTTPException {
  const body: ApiErrorBody = { statusCode: status, message, ...(errors ? { errors } : {}) };
  return new HTTPException(status, { message, res: Response.json(body, { status }) });
}

/**
 * Valide une partie de la requête contre un schéma Zod de `@jc/domain`.
 *
 * Zod plutôt que des décorateurs de validation : les schémas sont ainsi
 * partagés tels quels avec l'application Expo, qui applique les mêmes règles
 * avant d'envoyer. Une seule définition, deux points d'application.
 */
export function validate<S extends z.ZodTypeAny>(target: "json" | "query" | "param", schema: S) {
  return validator(target, (value): z.output<S> => {
    const result = schema.safeParse(value);
    if (result.success) return result.data;

    const errors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "_";
      (errors[path] ??= []).push(issue.message);
    }
    throw httpError(400, "Données invalides.", errors);
  });
}

/**
 * Dernier filet : tout ce qui n'est pas une erreur volontairement construite
 * part dans les logs serveur et ressort en 500 générique.
 */
export function onError(error: Error, c: Context): Response {
  if (error instanceof HTTPException) {
    return (
      error.res ??
      c.json(
        { statusCode: error.status, message: error.message } satisfies ApiErrorBody,
        error.status,
      )
    );
  }

  console.error("Exception non gérée", error.stack ?? error);
  return c.json(
    { statusCode: 500, message: "Une erreur interne est survenue." } satisfies ApiErrorBody,
    500,
  );
}
