/**
 * Enregistre un fichier reçu du serveur.
 *
 * Sur téléphone, il n'y a pas encore de façon d'enregistrer un fichier depuis
 * l'application : on le dit plutôt que de faire semblant. La version web est
 * dans `download-file.web.ts`.
 */
export const CAN_DOWNLOAD = false;

export function downloadFile(_blob: Blob, _filename: string): void {
  throw new Error("Le téléchargement n'est pas encore disponible sur téléphone.");
}
