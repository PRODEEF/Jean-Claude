import { Platform } from "react-native";
import type { Point } from "./popover-placement";

/**
 * Dernier appui, sur le web.
 *
 * Les grilles du calendrier disent « ce jour, cette heure », pas « ici à
 * l'écran ». Plutôt que de leur faire porter une position, on retient où
 * l'utilisateur vient d'appuyer : la fenêtre s'ouvre à côté, sans recouvrir.
 * Sans effet hors web, où la fenêtre garde sa place habituelle.
 */
let last: (Point & { at: number }) | null = null;

if (Platform.OS === "web" && typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      last = { x: event.clientX, y: event.clientY, at: Date.now() };
    },
    true,
  );
}

/** Appui des dernières secondes, ou `null` : une fenêtre ouverte autrement (clavier, minuteur) n'a pas d'appui à éviter. */
export function recentPointer(maxAgeMs = 1_500): Point | null {
  if (!last || Date.now() - last.at > maxAgeMs) return null;
  return { x: last.x, y: last.y };
}
