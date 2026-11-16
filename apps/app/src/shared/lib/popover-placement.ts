export type Point = { x: number; y: number };

/** Largeur de la fenêtre de saisie (`max-w-lg`) et hauteur d'un formulaire d'événement, en pixels. */
const WINDOW_WIDTH = 512;
const WINDOW_HEIGHT = 560;
/** Distance entre le point cliqué et la fenêtre : de quoi laisser la case voisine visible. */
const GAP = 140;
const MARGIN = 16;

/**
 * Où poser une fenêtre pour qu'elle ne recouvre pas le point cliqué.
 *
 * À droite du clic s'il y a la place, sinon à gauche, comme le fait Google
 * Agenda. `null` quand aucun côté ne convient (fenêtre étroite) : l'appelant
 * garde alors la fenêtre centrée, qui vaut mieux qu'une fenêtre coupée.
 */
export function placeBeside(
  anchor: Point,
  viewport: { width: number; height: number },
): { left: number; top: number } | null {
  const top = Math.min(
    Math.max(anchor.y - WINDOW_HEIGHT / 2, MARGIN),
    Math.max(MARGIN, viewport.height - WINDOW_HEIGHT - MARGIN),
  );

  if (anchor.x + GAP + WINDOW_WIDTH + MARGIN <= viewport.width) {
    return { left: anchor.x + GAP, top };
  }
  if (anchor.x - GAP - WINDOW_WIDTH >= MARGIN) {
    return { left: anchor.x - GAP - WINDOW_WIDTH, top };
  }
  return null;
}
