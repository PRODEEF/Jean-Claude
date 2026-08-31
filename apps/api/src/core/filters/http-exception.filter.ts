import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";

export type ApiErrorBody = {
  statusCode: number;
  message: string;
  /** Erreurs de validation par champ, quand la requête a été rejetée par Zod. */
  errors?: Record<string, string[]>;
};

/**
 * Normalise toutes les erreurs sortantes.
 *
 * Deux objectifs : donner aux clients (web, mobile, desktop) une forme unique
 * à gérer, et garantir qu'aucune erreur interne — trace, requête SQL, fragment
 * de prompt — n'atteint le client. Ces détails partent dans les logs serveur.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      const body: ApiErrorBody =
        typeof response === "string"
          ? { statusCode: status, message: response }
          : { ...(response as Omit<ApiErrorBody, "statusCode">), statusCode: status };

      void reply.status(status).send(body);
      return;
    }

    this.logger.error(
      "Exception non gérée",
      exception instanceof Error ? exception.stack : String(exception),
    );

    void reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Une erreur interne est survenue.",
    } satisfies ApiErrorBody);
  }
}
