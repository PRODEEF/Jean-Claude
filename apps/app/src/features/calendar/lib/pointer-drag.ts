import { useEffect, useRef, type RefObject } from "react";
import { Platform, type View } from "react-native";

/**
 * Glisser-déposer d'une liste à la souris, comme dans Google Agenda : la liste
 * suit le curseur, la cible survolée s'éclaire, et la liste se dépose là où l'on
 * relâche.
 *
 * Il remplace, dans la vue Mois, le glisser natif du navigateur : celui-ci n'a
 * qu'une petite image fantôme, aucun repère sur la cible, et il part avec
 * retard (Yann, 12 novembre : « poussif et très mauvais en UX »). Les autres
 * vues gardent le leur, `list-drag.ts`.
 *
 * Web seulement, souris et stylet. Au doigt, le geste se confondrait avec le
 * défilement : l'appui long (section Mobile de la ROADMAP) viendra plus tard.
 */

/** Distance parcourue avant que l'appui devienne un glisser : un clic reste un clic. */
const DRAG_THRESHOLD_PX = 5;

type DropTarget = {
  accepts: (listId: string) => boolean;
  onDrop: (listId: string) => void;
};

/** Les cibles de dépôt, par élément : retrouvées en remontant depuis le curseur. */
const targets = new Map<HTMLElement, DropTarget>();

function targetUnder(x: number, y: number, listId: string): HTMLElement | null {
  let node = document.elementFromPoint(x, y) as HTMLElement | null;
  while (node) {
    const target = targets.get(node);
    if (target?.accepts(listId)) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Cible de dépôt. L'élément le plus proche du curseur gagne : une ligne de liste
 * posée dans une case prend le dépôt avant la case.
 */
export function usePointerDropTarget(
  ref: RefObject<View | null>,
  enabled: boolean,
  accepts: (listId: string) => boolean,
  onDrop: (listId: string) => void,
): void {
  const latest = useRef({ accepts, onDrop });
  latest.current = { accepts, onDrop };

  useEffect(() => {
    if (Platform.OS !== "web" || !enabled) return;
    const element = ref.current as unknown as HTMLElement | null;
    if (!element) return;

    targets.set(element, {
      accepts: (listId) => latest.current.accepts(listId),
      onDrop: (listId) => latest.current.onDrop(listId),
    });
    return () => {
      targets.delete(element);
    };
  }, [ref, enabled]);
}

/**
 * Ce qu'on saisit : la carte entière, ou sa poignée si elle en a une. La copie
 * qui suit le curseur est toujours la carte, légèrement penchée comme un post-it
 * qu'on soulève.
 */
export function usePointerListDrag(
  listId: string,
  enabled: boolean,
): { cardRef: RefObject<View | null>; gripRef: RefObject<View | null> } {
  const cardRef = useRef<View | null>(null);
  const gripRef = useRef<View | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || !enabled) return;

    const card = cardRef.current as unknown as HTMLElement | null;
    const grip = (gripRef.current as unknown as HTMLElement | null) ?? card;
    if (!card || !grip) return;

    const onPointerDown = (down: PointerEvent) => {
      if (down.button !== 0 || down.pointerType === "touch") return;

      let ghost: HTMLElement | null = null;
      let highlighted: HTMLElement | null = null;
      let offsetX = 0;
      let offsetY = 0;
      const startX = down.clientX;
      const startY = down.clientY;

      const clearHighlight = () => {
        if (highlighted) {
          highlighted.style.outline = "";
          highlighted.style.outlineOffset = "";
          highlighted = null;
        }
      };

      const start = () => {
        const rect = card.getBoundingClientRect();
        offsetX = startX - rect.left;
        offsetY = startY - rect.top;

        ghost = card.cloneNode(true) as HTMLElement;
        Object.assign(ghost.style, {
          position: "fixed",
          left: "0px",
          top: "0px",
          width: `${rect.width}px`,
          margin: "0",
          zIndex: "2147483647",
          pointerEvents: "none",
          opacity: "0.95",
          boxShadow: "0 6px 16px rgba(0, 0, 0, 0.25)",
          transform: `translate(${rect.left}px, ${rect.top}px) rotate(-1.5deg)`,
          transformOrigin: "left top",
        });
        document.body.appendChild(ghost);

        // Posé sur le nœud et non via un état : un rendu au milieu du geste
        // remplacerait le nœud et annulerait le dépôt.
        card.style.opacity = "0.4";
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      };

      const move = (event: PointerEvent) => {
        if (!ghost) {
          if (Math.hypot(event.clientX - startX, event.clientY - startY) < DRAG_THRESHOLD_PX) {
            return;
          }
          start();
        }
        if (!ghost) return;

        ghost.style.transform = `translate(${event.clientX - offsetX}px, ${
          event.clientY - offsetY
        }px) rotate(-1.5deg)`;

        const over = targetUnder(event.clientX, event.clientY, listId);
        if (over !== highlighted) {
          clearHighlight();
          if (over) {
            over.style.outline = "2px solid currentColor";
            over.style.outlineOffset = "-2px";
            highlighted = over;
          }
        }
      };

      const finish = (event: PointerEvent, dropped: boolean) => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", cancel);
        if (!ghost) return;

        const over = dropped ? targetUnder(event.clientX, event.clientY, listId) : null;
        clearHighlight();
        ghost.remove();
        ghost = null;
        card.style.opacity = "";
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        // Un vrai glisser ne doit pas finir en clic : relâcher sur la ligne
        // qu'on a saisie l'ouvrirait.
        const swallowClick = (click: Event) => {
          click.stopPropagation();
          click.preventDefault();
        };
        window.addEventListener("click", swallowClick, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", swallowClick, true), 0);

        if (over) targets.get(over)?.onDrop(listId);
      };
      const up = (event: PointerEvent) => finish(event, true);
      const cancel = (event: PointerEvent) => finish(event, false);

      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
      document.addEventListener("pointercancel", cancel);
    };

    grip.addEventListener("pointerdown", onPointerDown);
    grip.style.cursor = "grab";
    return () => {
      grip.removeEventListener("pointerdown", onPointerDown);
      grip.style.cursor = "";
    };
  }, [enabled, listId]);

  return { cardRef, gripRef };
}
