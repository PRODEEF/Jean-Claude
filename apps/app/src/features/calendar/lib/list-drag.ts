import { useEffect, useRef, type RefObject } from "react";
import { Platform, type View } from "react-native";

/**
 * Glisser-déposer d'une liste vers un moment d'un jour, dans la vue Todo.
 *
 * Type nommé, comme pour les lignes de tâche : une image ou un texte lâché sur
 * un moment ne doit pas dater une liste.
 */
const LIST_MIME = "application/x-jean-claude-list";

/**
 * Glisser en cours, lu par les cibles : `dataTransfer.getData` est vide
 * pendant le survol, le navigateur ne livrant la charge qu'au dépôt.
 */
let activeListId: string | null = null;

/**
 * Poignée de la liste : seule elle est déplaçable. La carte entière l'étant,
 * on ne pourrait plus sélectionner le texte ni cocher une tâche sans risque
 * de déplacer la liste.
 *
 * Web seulement, comme le rangement des dossiers : au doigt, le geste se
 * confond avec le défilement de la page.
 */
export function useListDragHandle(
  listId: string,
  enabled: boolean,
): { cardRef: RefObject<View | null>; gripRef: RefObject<View | null> } {
  const cardRef = useRef<View | null>(null);
  const gripRef = useRef<View | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || !enabled) return;

    const card = cardRef.current as unknown as HTMLElement | null;
    const grip = gripRef.current as unknown as HTMLElement | null;
    if (!card || !grip) return;

    const start = (event: DragEvent) => {
      if (!event.dataTransfer) return;
      event.dataTransfer.setData(LIST_MIME, listId);
      event.dataTransfer.effectAllowed = "move";
      // L'image suivie est la carte entière : on voit ce qu'on déplace.
      const rect = card.getBoundingClientRect();
      event.dataTransfer.setDragImage(card, event.clientX - rect.left, event.clientY - rect.top);
      activeListId = listId;
      // Opacité posée sur le nœud, pas via un état : un rendu au milieu du
      // geste remplacerait le nœud et le navigateur annulerait le dépôt.
      card.style.opacity = "0.5";
    };

    const end = () => {
      if (activeListId === listId) activeListId = null;
      card.style.opacity = "";
    };

    grip.setAttribute("draggable", "true");
    grip.style.cursor = "grab";
    grip.style.userSelect = "none";
    grip.addEventListener("dragstart", start);
    grip.addEventListener("dragend", end);

    return () => {
      card.style.opacity = "";
      grip.removeAttribute("draggable");
      grip.removeEventListener("dragstart", start);
      grip.removeEventListener("dragend", end);
      if (activeListId === listId) activeListId = null;
    };
  }, [enabled, listId]);

  return { cardRef, gripRef };
}

/**
 * Cible de dépôt : un moment d'un jour.
 *
 * `accepts` dit si la liste glissée peut y atterrir (jour révolu, même place) ;
 * la surbrillance passe par le nœud pour la même raison que l'opacité.
 */
export function useMomentDropZone(
  enabled: boolean,
  accepts: (listId: string) => boolean,
  onDrop: (listId: string) => void,
): RefObject<View | null> {
  const zoneRef = useRef<View | null>(null);
  const latest = useRef({ accepts, onDrop });
  latest.current = { accepts, onDrop };

  useEffect(() => {
    if (Platform.OS !== "web" || !enabled) return;

    const zone = zoneRef.current as unknown as HTMLElement | null;
    if (!zone) return;

    const clear = () => {
      zone.style.outline = "";
      zone.style.outlineOffset = "";
    };

    const over = (event: DragEvent) => {
      const id = activeListId;
      if (!id || !event.dataTransfer?.types.includes(LIST_MIME)) return;
      if (!latest.current.accepts(id)) {
        clear();
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      zone.style.outline = "2px dashed currentColor";
      zone.style.outlineOffset = "2px";
    };

    const drop = (event: DragEvent) => {
      const id = activeListId;
      clear();
      if (!id || !latest.current.accepts(id)) return;
      event.preventDefault();
      latest.current.onDrop(id);
    };

    zone.addEventListener("dragover", over);
    zone.addEventListener("dragleave", clear);
    zone.addEventListener("drop", drop);

    return () => {
      clear();
      zone.removeEventListener("dragover", over);
      zone.removeEventListener("dragleave", clear);
      zone.removeEventListener("drop", drop);
    };
  }, [enabled]);

  return zoneRef;
}
