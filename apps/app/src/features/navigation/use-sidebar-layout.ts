import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Trois présentations de la navigation, basculables à tout moment.
 *
 * `classic` : bannière en haut, raccourcis en pied de barre.
 * `modern` : pas de bannière — l'en-tête de la barre porte le canal, les
 * raccourcis et le sélecteur d'espace, le pied porte le profil, comme Claude.
 * `home` : pas de barre latérale permanente — une barre d'onglets en haut, et
 * un accueil qui montre la journée (rendez-vous, listes, conversations à
 * reprendre) au lieu d'une page vide. L'arborescence reste à un geste, en
 * tiroir. Sur le modèle de l'accueil de Notion et de la vue Aujourd'hui de
 * Things 3 et Todoist (§4.2).
 *
 * Les trois coexistent le temps de les comparer à l'usage (§4.3) ; les
 * perdantes seront retirées du code.
 */
export type SidebarLayout = "classic" | "modern" | "home";

/** Libellés présentés à l'utilisateur, dans l'ordre où les variantes sont nées. */
export const SIDEBAR_LAYOUTS: { value: SidebarLayout; label: string }[] = [
  { value: "classic", label: "Classique" },
  { value: "modern", label: "Latérale" },
  { value: "home", label: "Accueil" },
];

const STORAGE_KEY = "jc.sidebar-layout";

/**
 * Mémorisé sur l'appareil, pas dans le profil : c'est un choix de
 * présentation en cours d'évaluation, qui n'a pas à faire l'objet d'une
 * migration tant qu'aucune des deux variantes n'est retenue.
 */
let current: SidebarLayout = "classic";
let hydrated = false;
const listeners = new Set<() => void>();

function publish(next: SidebarLayout) {
  if (current === next) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  AsyncStorage.getItem(STORAGE_KEY)
    .then((stored) => {
      const known = SIDEBAR_LAYOUTS.find((layout) => layout.value === stored);
      if (known) publish(known.value);
    })
    // Stockage indisponible (navigation privée) : on reste sur la barre par défaut.
    .catch(() => undefined);
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setSidebarLayout(next: SidebarLayout) {
  publish(next);
  AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
}

export function useSidebarLayout(): SidebarLayout {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}
