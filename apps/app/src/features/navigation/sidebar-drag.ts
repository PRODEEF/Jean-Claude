import { useEffect, useRef, useState, type RefObject } from "react";
import { Platform, type View } from "react-native";

/**
 * Types de charge du glisser-déposer.
 *
 * Nommés plutôt que `text/plain` : c'est ce qui permet à un dossier de refuser
 * une image ou une sélection de texte tombée dessus par accident. Deux types
 * distincts parce que les deux dépôts ne font pas la même chose — ranger une
 * conversation d'un côté, déplacer une branche entière de l'autre.
 */
const CONVERSATION_MIME = "application/x-jean-claude-conversation";
const FOLDER_MIME = "application/x-jean-claude-folder";

/**
 * Nœud DOM d'une vue — web uniquement.
 *
 * `react-native-web` rend une `View` sous forme de `div` et lui transmet la
 * référence : la conversion est garantie par le test de plateforme. Elle est
 * aussi le seul chemin possible, `react-native-web` ne transmettant pas les
 * propriétés du glisser-déposer HTML (`draggable`, `onDragStart`, `onDrop`…) —
 * contrairement à `onContextMenu`, qui, lui, passe.
 */
function domNode(ref: RefObject<View | null>): HTMLElement | null {
  if (Platform.OS !== "web") return null;
  return (ref.current as unknown as HTMLElement | null) ?? null;
}

/**
 * Rend une rangée de conversation déplaçable à la souris.
 *
 * Web seulement : au doigt, c'est le menu contextuel (appui long) qui donne
 * accès au rangement. Un glisser tactile se confondrait avec le défilement de
 * la barre latérale, qui est le geste attendu à cet endroit.
 */
export function useConversationDragSource(conversationId: string): RefObject<View | null> {
  const ref = useRef<View | null>(null);

  useEffect(() => {
    const node = domNode(ref);
    if (!node) return;

    const start = (event: DragEvent) => {
      if (!event.dataTransfer) return;
      event.dataTransfer.setData(CONVERSATION_MIME, conversationId);
      event.dataTransfer.effectAllowed = "copyMove";
    };

    node.setAttribute("draggable", "true");
    node.addEventListener("dragstart", start);

    return () => {
      node.removeAttribute("draggable");
      node.removeEventListener("dragstart", start);
    };
  }, [conversationId]);

  return ref;
}

/**
 * Rend une rangée de dossier déplaçable à la souris.
 *
 * `move` et non `copyMove` : un dossier n'a qu'une place, contrairement à une
 * conversation, qui peut être rangée dans plusieurs (§5.2, A.1).
 */
export function useFolderDragSource(folderId: string): RefObject<View | null> {
  const ref = useRef<View | null>(null);

  useEffect(() => {
    const node = domNode(ref);
    if (!node) return;

    const start = (event: DragEvent) => {
      if (!event.dataTransfer) return;
      event.dataTransfer.setData(FOLDER_MIME, folderId);
      event.dataTransfer.effectAllowed = "move";
    };

    node.setAttribute("draggable", "true");
    node.addEventListener("dragstart", start);

    return () => {
      node.removeAttribute("draggable");
      node.removeEventListener("dragstart", start);
    };
  }, [folderId]);

  return ref;
}

export type FolderDropHandlers = {
  /** Absent sur la zone racine, qui ne reçoit que des dossiers. */
  onConversation?: (conversationId: string) => void;
  onFolder: (folderId: string) => void;
};

/**
 * Fait d'une rangée de dossier une cible de dépôt.
 *
 * `isOver` sert à éclairer la rangée survolée : sans ce retour, on lâche sans
 * savoir sur quel dossier ça va tomber, l'arborescence étant dense et les
 * rangées serrées. Une charge d'un type non attendu ne déclenche rien — le
 * navigateur affiche alors son curseur d'interdiction, sans qu'on ait à le
 * dire.
 */
export function useFolderDropTarget(handlers: FolderDropHandlers): {
  ref: RefObject<View | null>;
  isOver: boolean;
} {
  const ref = useRef<View | null>(null);
  const [isOver, setIsOver] = useState(false);
  // Les gestionnaires sont posés une fois ; cette référence est ce qui leur
  // donne accès aux rappels du rendu courant sans les rejouer à chaque rendu.
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const node = domNode(ref);
    if (!node) return;

    /** Ce que porte la charge, si la zone sait en faire quelque chose. */
    const accepted = (event: DragEvent): typeof FOLDER_MIME | typeof CONVERSATION_MIME | null => {
      const types = event.dataTransfer?.types;
      if (!types) return null;
      if (types.includes(FOLDER_MIME)) return FOLDER_MIME;
      if (types.includes(CONVERSATION_MIME) && latest.current.onConversation) {
        return CONVERSATION_MIME;
      }
      return null;
    };

    const over = (event: DragEvent) => {
      if (!accepted(event)) return;
      // Sans `preventDefault`, le navigateur refuse le dépôt : c'est ainsi
      // qu'on déclare la zone réceptive.
      event.preventDefault();
      setIsOver(true);
    };

    const leave = () => setIsOver(false);

    const drop = (event: DragEvent) => {
      const mime = accepted(event);
      if (!mime) return;
      event.preventDefault();
      setIsOver(false);

      const id = event.dataTransfer?.getData(mime);
      if (!id) return;
      if (mime === FOLDER_MIME) latest.current.onFolder(id);
      else latest.current.onConversation?.(id);
    };

    node.addEventListener("dragover", over);
    node.addEventListener("dragleave", leave);
    node.addEventListener("drop", drop);

    return () => {
      node.removeEventListener("dragover", over);
      node.removeEventListener("dragleave", leave);
      node.removeEventListener("drop", drop);
    };
  }, []);

  return { ref, isOver };
}
