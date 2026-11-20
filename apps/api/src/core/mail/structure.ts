/** Un nœud de la structure d'un mail, telle que le serveur de courrier la décrit. */
export type BodyNode = {
  disposition?: string | undefined;
  childNodes?: BodyNode[] | undefined;
};

/**
 * Le mail porte-t-il une pièce jointe ?
 *
 * Seule la structure est lue, sans télécharger le mail : c'est ce qui permet de
 * mettre un trombone sur chaque ligne de la liste. Une image intégrée au texte
 * (disposition « inline ») n'est pas une pièce jointe.
 */
export function hasAttachments(node: BodyNode | undefined): boolean {
  if (!node) return false;
  if (node.disposition?.toLowerCase() === "attachment") return true;
  return (node.childNodes ?? []).some((child) => hasAttachments(child));
}
