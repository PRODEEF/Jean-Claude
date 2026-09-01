import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { config } from "./core/config.js";

serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" });
console.log(`API à l'écoute sur le port ${config.port} — moteur ${config.llmModel}`);
