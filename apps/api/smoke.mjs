// Démarre l'API construite comme Node le fait en production et interroge /api/health.
//
// Les tests Jest ne voient pas un import qui plante sous Node pur (un module
// CommonJS importé en exports nommés, par exemple) : Jest le rend lisible. Ce
// contrôle l'attrape avant la mise en production. Valeurs factices : seul le
// chargement des modules compte, aucun réseau n'est ouvert.
process.env.SUPABASE_URL ??= "http://localhost";
process.env.SUPABASE_ANON_KEY ??= "ci-placeholder";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "ci-placeholder";
process.env.AI_GATEWAY_API_KEY ??= "ci-placeholder";

const { app } = await import("./dist/app.js");
const response = await app.fetch(new Request("http://localhost/api/health"));
if (response.status !== 200) {
  console.error(`/api/health a répondu ${response.status}.`);
  process.exit(1);
}
console.log("API démarrée : /api/health répond 200.");
