import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { config } from "./core/config.js";

serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" });
// Moteur par défaut seulement : chaque utilisateur peut retenir le sien dans
// ses réglages (§5.1, `profile.preferences.llmModel`) — ce log ne dit que ce
// que sert l'API à qui n'a encore rien choisi.
console.log(`API à l'écoute sur le port ${config.port} — moteur par défaut ${config.llmModel}`);
