import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Largeurs des deux colonnes de gauche ; la lecture prend le reste. */
export type ColumnWidths = { folders: number; list: number };

export const DEFAULT_COLUMNS: ColumnWidths = { folders: 260, list: 380 };
export const FOLDERS_RANGE = { min: 180, max: 420 };
export const LIST_RANGE = { min: 280, max: 640 };

const STORAGE_KEY = "jc.mail.columns";

const clamp = (value: number, range: { min: number; max: number }) =>
  Math.min(range.max, Math.max(range.min, Math.round(value)));

/**
 * Largeurs des colonnes, retenues sur l'appareil : un séparateur placé à un
 * endroit y reste après une déconnexion ou un rechargement. Une préférence
 * d'affichage, sans valeur d'un appareil à l'autre — un écran large et un écran
 * étroit n'ont pas les mêmes besoins.
 */
export function useColumnWidths() {
  const [widths, setWidths] = useState<ColumnWidths>(DEFAULT_COLUMNS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        const parsed: unknown = JSON.parse(stored);
        if (typeof parsed !== "object" || parsed === null) return;
        const record: Record<string, unknown> = { ...parsed };
        const { folders, list } = record;
        if (typeof folders === "number" && typeof list === "number") {
          setWidths({ folders: clamp(folders, FOLDERS_RANGE), list: clamp(list, LIST_RANGE) });
        }
      })
      // Stockage indisponible (navigation privée) : largeurs par défaut.
      .catch(() => undefined);
  }, []);

  const persist = useCallback((next: ColumnWidths) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  return { widths, setWidths, persist };
}

/**
 * Séparateur vertical qu'on fait glisser pour élargir ou rétrécir la colonne à
 * sa gauche. La poignée fait 10 px de large pour se saisir sans viser, le trait
 * visible n'en fait qu'un.
 */
export function ColumnResizer({
  width,
  range,
  label,
  onResize,
  onCommit,
}: {
  width: number;
  range: { min: number; max: number };
  label: string;
  onResize: (width: number) => void;
  onCommit: (width: number) => void;
}) {
  const start = useRef(width);
  const latest = useRef({ width, range, onResize, onCommit });
  latest.current = { width, range, onResize, onCommit };
  const [active, setActive] = useState(false);

  // Sur le web, glisser sélectionne le texte qu'on survole, et le navigateur
  // annule alors le geste : on fige la sélection le temps du glissement.
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.userSelect = previous;
    };
  }, [active]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Les listes voisines défilent et réclameraient le geste dès le premier
        // mouvement : la poignée le garde jusqu'au relâchement.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          start.current = latest.current.width;
          setActive(true);
        },
        onPanResponderMove: (_, gesture) => {
          const { range: r, onResize: resize } = latest.current;
          resize(clamp(start.current + gesture.dx, r));
        },
        onPanResponderRelease: (_, gesture) => {
          const { range: r, onCommit: commit } = latest.current;
          setActive(false);
          commit(clamp(start.current + gesture.dx, r));
        },
        onPanResponderTerminate: () => {
          setActive(false);
          latest.current.onCommit(latest.current.width);
        },
      }),
    [],
  );

  return (
    <View
      {...responder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: range.min, max: range.max, now: width }}
      // `col-resize` : le curseur annonce qu'on peut glisser (web seulement).
      className="w-2.5 cursor-col-resize items-center self-stretch"
    >
      <View className={active ? "bg-primary w-0.5 flex-1" : "bg-border w-px flex-1"} />
    </View>
  );
}
