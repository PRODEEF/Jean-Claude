import { useEffect, useRef, type RefObject } from "react";
import { Platform, type View } from "react-native";

/**
 * Charge du glisser-déposer d'une ligne de todoliste.
 *
 * Type nommé, comme pour les dossiers : une image ou une sélection de texte
 * lâchée sur une ligne ne doit pas en changer l'ordre.
 */
const TASK_ROW_MIME = "application/x-jean-claude-task-row";

export type TaskRowDrag = { key: string; depth: 0 | 1 };

/** Où la ligne survole s'insère : avant cette ligne, ou juste après. */
export type TaskDropPlace = "before" | "after";

/**
 * Glisser en cours, lu par les autres lignes.
 *
 * `dataTransfer.getData` est vide pendant le survol : le navigateur ne révèle
 * la charge qu'au dépôt. Sans cet état, une ligne ne saurait pas si le geste
 * vient de sa propre liste.
 */
let activeDrag: { listId: string; key: string } | null = null;

function familyStart(rows: readonly TaskRowDrag[], index: number): number {
  let cursor = index;
  while (rows[cursor]?.depth === 1 && cursor > 0) cursor -= 1;
  return cursor;
}

/** Première ligne qui n'appartient plus à la famille commencée à `start`. */
function familyEnd(rows: readonly TaskRowDrag[], start: number): number {
  let end = start + 1;
  while (rows[end]?.depth === 1) end += 1;
  return end;
}

/**
 * Index d'insertion (avant cette ligne), ou `null` si le dépôt ne déplace rien.
 *
 * Une tâche de premier niveau emporte ses sous-tâches et ne se pose qu'entre
 * deux familles : la lâcher au milieu d'une autre leur donnerait un nouveau
 * parent, le serveur déduisant la filiation de la ligne qui précède.
 *
 * Une sous-tâche ne circule qu'entre les sœurs du même parent. Changer de
 * parent reste le geste d'indentation, pas celui du déplacement.
 */
export function taskDropIndex(
  rows: readonly TaskRowDrag[],
  sourceKey: string,
  targetIndex: number,
  place: TaskDropPlace,
): number | null {
  const sourceIndex = rows.findIndex((row) => row.key === sourceKey);
  const source = rows[sourceIndex];
  const target = rows[targetIndex];
  if (!source || !target) return null;

  if (source.depth === 1) {
    const parent = familyStart(rows, sourceIndex);
    const end = familyEnd(rows, parent);
    if (targetIndex < parent || targetIndex >= end) return null;
    if (targetIndex === parent) {
      if (place === "before") return null;
      return sourceIndex === parent + 1 ? null : parent + 1;
    }

    const dest = place === "before" ? targetIndex : targetIndex + 1;
    if (dest === sourceIndex || dest === sourceIndex + 1) return null;
    return dest;
  }

  const end = familyEnd(rows, sourceIndex);
  const family = familyStart(rows, targetIndex);
  const dest = place === "before" ? family : familyEnd(rows, family);
  if (dest >= sourceIndex && dest <= end) return null;
  return dest;
}

/**
 * Déplace le bloc désigné par `sourceKey` pour qu'il commence à `insertBefore`.
 *
 * `insertBefore` est un index du tableau d'origine, `rows.length` pour la fin.
 */
export function reorderTaskRows<T extends TaskRowDrag>(
  rows: readonly T[],
  sourceKey: string,
  insertBefore: number,
): T[] | null {
  const sourceIndex = rows.findIndex((row) => row.key === sourceKey);
  const source = rows[sourceIndex];
  if (!source || insertBefore < 0 || insertBefore > rows.length) return null;

  const start = sourceIndex;
  const end = source.depth === 0 ? familyEnd(rows, sourceIndex) : sourceIndex + 1;
  if (insertBefore >= start && insertBefore <= end) return null;

  const block = rows.slice(start, end);
  const rest = [...rows.slice(0, start), ...rows.slice(end)];
  const at = insertBefore > end ? insertBefore - (end - start) : insertBefore;
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

type RowDragHandlers = {
  rowIndex: number;
  resolveDrop: (sourceKey: string, targetIndex: number, place: TaskDropPlace) => number | null;
  onHover: (insertBefore: number | null) => void;
  onDrop: (sourceKey: string, insertBefore: number) => void;
};

/**
 * Poignée et cible de dépôt d'une ligne.
 *
 * Web seulement, comme le rangement des dossiers : au doigt, le geste se
 * confond avec le défilement de la page. La poignée seule est déplaçable —
 * la ligne entière l'étant, on ne pourrait plus sélectionner le texte.
 */
export function useTaskRowDrag(
  listId: string,
  rowKey: string,
  draggable: boolean,
  handlers: RowDragHandlers,
): { rowRef: RefObject<View | null>; gripRef: RefObject<View | null> } {
  const rowRef = useRef<View | null>(null);
  const gripRef = useRef<View | null>(null);
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const row = rowRef.current as unknown as HTMLElement | null;
    const grip = gripRef.current as unknown as HTMLElement | null;
    if (!row) return;

    const placeOf = (event: DragEvent): TaskDropPlace => {
      const rect = row.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    };

    const over = (event: DragEvent) => {
      if (!activeDrag || activeDrag.listId !== listId) return;
      if (!event.dataTransfer?.types.includes(TASK_ROW_MIME)) return;

      const insertBefore = latest.current.resolveDrop(
        activeDrag.key,
        latest.current.rowIndex,
        placeOf(event),
      );
      if (insertBefore === null) {
        latest.current.onHover(null);
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      latest.current.onHover(insertBefore);
    };

    const drop = (event: DragEvent) => {
      const source = activeDrag;
      if (!source || source.listId !== listId) return;

      const insertBefore = latest.current.resolveDrop(
        source.key,
        latest.current.rowIndex,
        placeOf(event),
      );
      latest.current.onHover(null);
      if (insertBefore === null) return;

      event.preventDefault();
      latest.current.onDrop(source.key, insertBefore);
    };

    row.addEventListener("dragover", over);
    row.addEventListener("drop", drop);

    const start = (event: DragEvent) => {
      if (!event.dataTransfer) return;
      event.dataTransfer.setData(TASK_ROW_MIME, `${listId}\n${rowKey}`);
      event.dataTransfer.effectAllowed = "move";
      // L'image suivie est la ligne entière, pas seulement la poignée : on
      // voit ce qu'on déplace, et le curseur reste au même endroit dessus.
      const rowRect = row.getBoundingClientRect();
      event.dataTransfer.setDragImage(
        row,
        event.clientX - rowRect.left,
        event.clientY - rowRect.top,
      );
      activeDrag = { listId, key: rowKey };
      // Opacité posée sur le nœud, pas via un état : un rendu au milieu du
      // geste remplacerait le nœud et le navigateur annulerait le dépôt.
      row.style.opacity = "0.5";
    };

    const end = () => {
      if (activeDrag?.key === rowKey && activeDrag.listId === listId) activeDrag = null;
      row.style.opacity = "";
      latest.current.onHover(null);
    };

    if (grip && draggable) {
      grip.setAttribute("draggable", "true");
      grip.style.cursor = "grab";
      grip.style.userSelect = "none";
      grip.addEventListener("dragstart", start);
      grip.addEventListener("dragend", end);
    }

    return () => {
      row.style.opacity = "";
      row.removeEventListener("dragover", over);
      row.removeEventListener("drop", drop);
      if (grip) {
        grip.removeAttribute("draggable");
        grip.removeEventListener("dragstart", start);
        grip.removeEventListener("dragend", end);
      }
      if (activeDrag?.key === rowKey && activeDrag.listId === listId) activeDrag = null;
    };
  }, [draggable, listId, rowKey]);

  return { rowRef, gripRef };
}
