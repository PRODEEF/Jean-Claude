/** Enregistre un fichier reçu du serveur, par un lien de téléchargement éphémère. */
export const CAN_DOWNLOAD = true;

export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Laisse au navigateur le temps de démarrer le téléchargement avant de libérer l'adresse.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
