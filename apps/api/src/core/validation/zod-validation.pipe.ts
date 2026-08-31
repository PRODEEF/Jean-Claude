import { ArgumentMetadata, BadRequestException, PipeTransform } from "@nestjs/common";
import { ZodError, type ZodSchema } from "zod";

/**
 * Valide le payload entrant contre un schéma Zod de `@jc/domain`.
 *
 * Zod plutôt que class-validator : les schémas sont ainsi partagés tels quels
 * avec l'application Expo, qui valide les mêmes règles côté client avant
 * d'envoyer. Une seule définition, deux points d'application.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        const errors: Record<string, string[]> = {};
        for (const issue of error.issues) {
          const path = issue.path.join(".") || "_";
          (errors[path] ??= []).push(issue.message);
        }
        throw new BadRequestException({ message: "Données invalides.", errors });
      }
      throw error;
    }
  }
}
