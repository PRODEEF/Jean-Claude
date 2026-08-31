const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { loadProjectEnv } = require("@expo/env");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

// Même raison que `app.config.js` : Metro inline `EXPO_PUBLIC_*` au bundle,
// il doit voir le `.env` racine, pas seulement `apps/app/.env`.
loadProjectEnv(workspaceRoot, { force: true });

const config = getDefaultConfig(projectRoot);

/**
 * Configuration monorepo.
 *
 * Sans ces deux réglages, Metro ne suit pas les modifications faites dans
 * `packages/*` et échoue à résoudre les dépendances hissées à la racine par
 * les workspaces npm. C'est la condition pour que `@jc/domain` et
 * `@jc/design` soient consommés en direct, sans étape de build intermédiaire.
 */
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// Empêche Metro de résoudre deux copies de React (une par workspace), ce qui
// se manifesterait par des erreurs de hooks difficiles à diagnostiquer.
config.resolver.disableHierarchicalLookup = true;

// NativeWind compile `global.css` et injecte les classes utilitaires dans le
// bundle. Le chemin est relatif à ce fichier, pas à la racine du monorepo.
module.exports = withNativeWind(config, { input: "./global.css" });
