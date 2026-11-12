import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Ce que le volet de droite montre : le détail de ce qu'on a choisi au milieu.
 *
 * Gauche = où l'on va, milieu = ce sur quoi on travaille, droite = le détail
 * de la chose choisie (décision de Yann, 11 novembre). Le volet est écrit une
 * seule fois : il reçoit un contenu et affiche le bon panneau, avec les mêmes
 * éditeurs que les écrans du milieu.
 */
export type PaneContent = { kind: "day"; day: Date } | { kind: "list"; listId: string };

type DetailPaneState = {
  content: PaneContent | null;
  /** Le volet existe-t-il à cette taille d'écran ? Sinon l'appelant garde son geste actuel. */
  available: boolean;
  open: (content: PaneContent) => void;
  close: () => void;
  /** Largeur choisie par l'utilisateur ; vit ici pour survivre à la fermeture du volet. */
  width: number;
  setWidth: (width: number) => void;
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
  const close = useCallback(() => setContent(null), []);
  const [width, setWidth] = useState(DETAIL_PANE_DEFAULT_WIDTH);

  const value = useMemo<DetailPaneState>(
    // Sans place pour lui (téléphone, fenêtre étroite), le volet reste vide :
    // un contenu resté en mémoire réapparaîtrait au retour sur grand écran.
    () => ({ content: available ? content : null, available, open, close, width, setWidth }),
    [available, content, open, close, width],
  );

  return <DetailPaneContext.Provider value={value}>{children}</DetailPaneContext.Provider>;
}

export function useDetailPane(): DetailPaneState {
  return useContext(DetailPaneContext);
}
