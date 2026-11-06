import { useEffect, useRef, type RefObject } from "react";
import { Platform, type View } from "react-native";
import { TASK_ROW_MIME, activeTaskRowDrag } from "@/features/todo/task-row-drag";

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
    // Sans poignée, l'élément entier se saisit : une pastille du calendrier n'a
    // ni texte à sélectionner ni case à cocher.
    const grip = (gripRef.current as unknown as HTMLElement | null) ?? card;
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

/** Ce qu'on glisse vers un jour : une liste entière, ou une seule de ses tâches. */
export type DayDrag = { kind: "list"; listId: string } | { kind: "task"; listId: string; taskId: string };

function currentDrag(event: DragEvent): DayDrag | null {
  const types = event.dataTransfer?.types;
  if (activeListId && types?.includes(LIST_MIME)) return { kind: "list", listId: activeListId };
  const row = activeTaskRowDrag();
  // Une ligne sans identifiant n'est pas encore enregistrée : rien à dater.
  if (row && types?.includes(TASK_ROW_MIME) && row.key !== "draft") {
    return { kind: "task", listId: row.listId, taskId: row.key };
  }
  return null;
}

/**
 * Cible de dépôt : un moment d'un jour.
 *
 * `accepts` dit si ce qu'on glisse peut y atterrir (jour révolu, même place) ;
 * la surbrillance passe par le nœud pour la même raison que l'opacité.
 */
export function useMomentDropZone(
  enabled: boolean,
  accepts: (drag: DayDrag) => boolean,
  onDrop: (drag: DayDrag, offsetY: number) => void,
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
      const drag = currentDrag(event);
      if (!drag || !event.dataTransfer) return;
      if (!latest.current.accepts(drag)) {
        clear();
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      zone.style.outline = "2px dashed currentColor";
      zone.style.outlineOffset = "2px";
    };

    const drop = (event: DragEvent) => {
      const drag = currentDrag(event);
      clear();
      if (!drag || !latest.current.accepts(drag)) return;
      event.preventDefault();
      // Ordonnée du lâcher dans la cible : la grille horaire en tire l'heure.
      latest.current.onDrop(drag, event.clientY - zone.getBoundingClientRect().top);
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
