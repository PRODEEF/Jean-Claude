import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { createNestApp } from "./core/http/create-nest-app";

async function bootstrap(): Promise<void> {
  const isProduction = process.env.NODE_ENV === "production";
  const app = await createNestApp(
    isProduction ? { swagger: false, logger: ["error", "warn"] } : {},
  );

  const port = app.get(ConfigService).get<number>("port", 3000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
