import { INestApplication, Logger, LogLevel } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "../../app.module";
import { HttpExceptionFilter } from "../filters/http-exception.filter";

export type CreateAppOptions = {
  swagger?: boolean;
  logger?: LogLevel[];
};

/**
 * Fabrique l'application Nest.
 *
 * Extraite de `main.ts` pour être réutilisable telle quelle par les tests e2e,
 * afin que ceux-ci s'exécutent contre exactement la même configuration
 * (filtres, pipes, CORS) que la production.
 */
export async function createNestApp(options: CreateAppOptions = {}): Promise<INestApplication> {
  const { swagger = true, logger } = options;

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 10 * 1024 * 1024 }),
    logger ? { logger } : {},
  );

  const config = app.get(ConfigService);

  app.setGlobalPrefix("api");
  app.useGlobalFilters(new HttpExceptionFilter());
  // Pas de `ValidationPipe` global : la validation se fait par route avec
  // `ZodValidationPipe`, à partir des schémas de `@jc/domain` partagés avec
  // le client. Un pipe global imposerait class-validator, donc une seconde
  // définition des mêmes règles.

  const corsOrigin = config.getOrThrow<string>("corsOrigin");
  app.enableCors({
    origin: corsOrigin === "*" ? true : corsOrigin.split(",").map((o) => o.trim()),
    credentials: true,
  });

  if (swagger) {
    const doc = new DocumentBuilder()
      .setTitle("Jean-Claude API")
      .setDescription("API commune web, mobile et desktop")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, doc));
    Logger.log("Swagger disponible sur /api/docs", "Bootstrap");
  }

  return app;
}
