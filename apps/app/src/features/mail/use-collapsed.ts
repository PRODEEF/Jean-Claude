import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "jc.mail.collapsed";

/**
 * Boîtes et dossiers repliés, retenus sur l'appareil.
 *
 * Un seul ensemble pour tout l'arbre, et non un réglage par ligne : un dossier
 * caché doit cacher ses sous-dossiers, ce que le parent ne sait dire que s'il
 * connaît l'état de toute la branche. Une préférence d'affichage, sans valeur
 * d'un appareil à l'autre.
 */
export function useCollapsed(): [Set<string>, (id: string) => void] {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed))
          setCollapsed(new Set(parsed.filter((v) => typeof v === "string")));
      })
      // Stockage indisponible (navigation privée) : tout reste déplié.
      .catch(() => undefined);
  }, []);

  const toggle = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...next])).catch(() => undefined);
      return next;
    });
  }, []);

  return [collapsed, toggle];
}
