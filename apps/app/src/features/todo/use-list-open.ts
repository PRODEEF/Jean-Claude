import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "jc.todo.collapsed";

/**
 * Listes repliées, retenues sur l'appareil (demande de Yann, 24 novembre) :
 * un chevron fermé le reste quand on change de section ou qu'on revient.
 *
 * L'état vit hors des composants. Une carte est démontée dès qu'on quitte son
 * écran, et un état local repartait chaque fois « déplié » ; le même module sert
 * donc « Mes listes » et le calendrier, qui montrent la même liste. Une
 * préférence d'affichage, sans valeur d'un appareil à l'autre.
 */
let collapsed = new Set<string>();
let loaded = false;
let persistScheduled = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(STORAGE_KEY)
    .then((stored) => {
      if (!stored) return;
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) return;
      // Ce que l'utilisateur a déjà replié pendant le chargement est gardé.
      const stillCollapsed = parsed.filter((id): id is string => typeof id === "string");
      collapsed = new Set([...stillCollapsed, ...collapsed]);
      emit();
    })
    // Stockage indisponible (navigation privée) : tout reste déplié.
    .catch(() => undefined);
}

function persist() {
  // Replier toutes les listes d'un coup appelle ce module une fois par carte :
  // une seule écriture suit.
  if (persistScheduled) return;
  persistScheduled = true;
  setTimeout(() => {
    persistScheduled = false;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed])).catch(() => undefined);
  }, 0);
}

function setOpen(id: string, open: boolean) {
  if (collapsed.has(id) === !open) return;
  const next = new Set(collapsed);
  if (open) next.delete(id);
  else next.add(id);
  collapsed = next;
  persist();
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Une liste est-elle dépliée ? Dépliée par défaut : une liste repliée d'office se ferait oublier. */
export function useListOpen(listId: string): [boolean, (open: boolean) => void] {
  useEffect(load, []);
  const open = useSyncExternalStore(
    subscribe,
    () => !collapsed.has(listId),
    () => true,
  );
  const change = useCallback((next: boolean) => setOpen(listId, next), [listId]);
  return [open, change];
}
