import { useEffect, useSyncExternalStore } from "react";
import { useWorkspaces } from "./use-workspaces";

/**
 * Dernier espace choisi, gardé hors de l'adresse.
 *
 * Le canal Jean-Claude, le calendrier et les réglages sont personnels : leur
 * adresse ne porte pas d'espace. Sans mémoire, ouvrir le canal depuis un espace
 * collaboratif ramenait à l'espace personnel sans que l'utilisateur l'ait
 * demandé. L'espace ne change plus que par un choix explicite dans le
 * sélecteur, ou en arrivant sur une adresse `/workspace/:id`.
 *
 * En mémoire seulement : un rechargement retombe sur l'adresse, comme avant.
 */
let remembered: string | null = null;
const listeners = new Set<() => void>();

export function rememberWorkspace(id: string | null) {
  if (remembered === id) return;
  remembered = id;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Espace ouvert, `null` dans l'espace personnel. */
export function useActiveWorkspaceId(pathname: string): string | null {
  const workspaces = useWorkspaces();
  const fromUrl = /^\/workspace\/([^/]+)/.exec(pathname)?.[1] ?? null;
  const stored = useSyncExternalStore(
    subscribe,
    () => remembered,
    () => remembered,
  );

  useEffect(() => {
    if (fromUrl) rememberWorkspace(fromUrl);
  }, [fromUrl]);

  const id = fromUrl ?? stored;
  // Un espace quitté ne doit pas rester affiché : la liste fait foi.
  if (id && workspaces.data && !workspaces.data.some((workspace) => workspace.id === id)) {
    return null;
  }
  return id;
}
