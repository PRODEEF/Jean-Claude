/**
 * Fuseau des tests du domaine, fixé avant le lancement des workers.
 *
 * Les règles de `planning` lisent l'horloge de l'appareil. Sur une machine en
 * UTC — celle de la CI —, aucune journée n'a 23 ni 25 heures, et les tests du
 * changement d'heure passeraient sans rien vérifier. Poser `process.env.TZ`
 * depuis un test ne suffit pas : Jest n'y expose qu'une copie de
 * l'environnement, que l'horloge du processus ne lit pas.
 */
module.exports = () => {
  process.env.TZ = "Europe/Paris";
};
