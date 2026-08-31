const path = require("node:path");
const { loadProjectEnv } = require("@expo/env");

// Expo charge `.env` depuis `apps/app/`. Le fichier unique du dépôt est à
// la racine du monorepo. `force` rejoue le chargement : Expo a déjà marqué
// l'environnement comme chargé (sur un dossier sans `.env`).
loadProjectEnv(path.resolve(__dirname, "../.."), { force: true });

module.exports = require("./app.json");
