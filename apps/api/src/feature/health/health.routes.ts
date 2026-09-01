import { Hono } from "hono";
import { llm } from "../../core/llm/providers/gateway.provider.js";

export const healthRoutes = new Hono().get("/", (c) =>
  // Exposer la souveraineté du moteur permet aux clients de l'afficher à
  // l'utilisateur, comme demandé au §5.1 et au §13.4.6.
  c.json({ status: "ok", llm: { provider: llm.name, sovereign: llm.isSovereign } }),
);
