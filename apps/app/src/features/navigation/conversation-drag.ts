import { useEffect, useRef, useState, type RefObject } from "react";
import { Platform, type View } from "react-native";

/**
 * Type de charge du glisser-déposer.
 *
 * Nommé plutôt que `text/plain` : c'est ce qui permet à un dossier de refuser
 * une image ou une sélection de texte tombée dessus par accident.
 */
const CONVERSATION_MIME = "application/x-jean-claude-conversation";

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
 * Fait d'une rangée de dossier une cible de dépôt.
 *
 * `isOver` sert à éclairer la rangée survolée : sans ce retour, on lâche la
 * conversation sans savoir sur quel dossier elle va tomber, l'arborescence
 * étant dense et les rangées serrées.
 */
export function useFolderDropTarget(onDrop: (conversationId: string) => void): {
  ref: RefObject<View | null>;
  isOver: boolean;
} {
  const ref = useRef<View | null>(null);
  const [isOver, setIsOver] = useState(false);
  // Les gestionnaires sont posés une fois ; cette référence est ce qui leur
  // donne accès au `onDrop` du rendu courant sans les rejouer à chaque rendu.
  const latest = useRef(onDrop);
  latest.current = onDrop;

  useEffect(() => {
    const node = domNode(ref);
    if (!node) return;

    const carriesConversation = (event: DragEvent) =>
      event.dataTransfer?.types.includes(CONVERSATION_MIME) ?? false;

    const over = (event: DragEvent) => {
      if (!carriesConversation(event)) return;
      // Sans `preventDefault`, le navigateur refuse le dépôt : c'est ainsi
      // qu'on déclare la zone réceptive.
      event.preventDefault();
      setIsOver(true);
    };

    const leave = () => setIsOver(false);

    const drop = (event: DragEvent) => {
      if (!carriesConversation(event)) return;
      event.preventDefault();
      setIsOver(false);

      const conversationId = event.dataTransfer?.getData(CONVERSATION_MIME);
      if (conversationId) latest.current(conversationId);
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
