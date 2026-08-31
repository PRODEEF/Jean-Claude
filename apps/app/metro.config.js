const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

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

module.exports = config;
