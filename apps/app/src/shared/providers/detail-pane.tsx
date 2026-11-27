import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Ce que le volet de droite montre : le détail de ce qu'on a choisi au milieu.
 *
 * Gauche = où l'on va, milieu = ce sur quoi on travaille, droite = le détail
 * de la chose choisie (décision de Yann, 11 novembre). Le volet est écrit une
 * seule fois : il reçoit un contenu et affiche le bon panneau, avec les mêmes
 * éditeurs que les écrans du milieu.
 */
export type PaneContent =
  | { kind: "day"; day: Date }
  // `occurrenceAt` : la date de la série sur laquelle on a cliqué, quand la liste se répète.
  // `view: "todo"` : la liste est datée et s'ouvre dans « Calendrier – Todo », là où on
  // la retrouvera, plutôt que dans « Mes listes ».
  | { kind: "list"; listId: string; occurrenceAt?: string; view?: "todo" }
  // Une proposition de l'assistant, à valider ou ignorer sans quitter le fil.
  | { kind: "suggestion"; conversationId: string; suggestionId: string };

type DetailPaneState = {
  content: PaneContent | null;
  /** Le volet existe-t-il à cette taille d'écran ? Sinon l'appelant garde son geste actuel. */
  available: boolean;
  open: (content: PaneContent) => void;
  close: () => void;
  /** Largeur choisie par l'utilisateur ; vit ici pour survivre à la fermeture du volet. */
  width: number;
  setWidth: (width: number) => void;
  /** Volet agrandi : il prend la place du milieu, qu'il rend en se refermant. */
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
};

/** Assez pour lire l'en-tête d'une liste (dossier, échéance, menu) sans la tronquer. */
export const DETAIL_PANE_DEFAULT_WIDTH = 480;

const DetailPaneContext = createContext<DetailPaneState>({
  content: null,
  available: false,
  open: () => undefined,
  close: () => undefined,
  width: DETAIL_PANE_DEFAULT_WIDTH,
  setWidth: () => undefined,
  expanded: false,
  setExpanded: () => undefined,
});

export function DetailPaneProvider({
  available,
  children,
}: {
  available: boolean;
  children: ReactNode;
}) {
  const [content, setContent] = useState<PaneContent | null>(null);
  const open = useCallback((next: PaneContent) => setContent(next), []);
  const [expanded, setExpanded] = useState(false);
  // Fermer le volet le rend aussi à sa taille : le rouvrir plus tard agrandi
  // laisserait le milieu masqué sans que rien n'explique pourquoi.
  const close = useCallback(() => {
    setContent(null);
    setExpanded(false);
  }, []);
  const [width, setWidth] = useState(DETAIL_PANE_DEFAULT_WIDTH);

  const value = useMemo<DetailPaneState>(
    // Sans place pour lui (téléphone, fenêtre étroite), le volet reste vide :
    // un contenu resté en mémoire réapparaîtrait au retour sur grand écran.
    () => ({
      content: available ? content : null,
      available,
      open,
      close,
      width,
      setWidth,
      expanded: available && content !== null && expanded,
      setExpanded,
    }),
    [available, content, open, close, width, expanded],
  );

  return <DetailPaneContext.Provider value={value}>{children}</DetailPaneContext.Provider>;
}

export function useDetailPane(): DetailPaneState {
  return useContext(DetailPaneContext);
}
