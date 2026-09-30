import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Deux présentations de la barre latérale, basculables à tout moment.
 *
 * `classic` : bannière en haut, raccourcis en pied de barre.
 * `modern` : pas de bannière — l'en-tête de la barre porte le canal, les
 * raccourcis et le sélecteur d'espace, le pied porte le profil, comme Claude.
 *
 * Les deux coexistent le temps de les comparer à l'usage (§4.3) ; la perdante
 * sera retirée du code.
 */
export type SidebarLayout = "classic" | "modern";

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
      if (stored === "classic" || stored === "modern") publish(stored);
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

export function toggleSidebarLayout() {
  setSidebarLayout(current === "classic" ? "modern" : "classic");
}

export function useSidebarLayout(): SidebarLayout {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}
