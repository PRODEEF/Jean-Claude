import { Platform } from "react-native";

/**
 * Police de l'interface.
 *
 * Deux valeurs et non une : `fontFamily` de React Native n'accepte qu'un seul
 * nom de famille, là où le web attend une pile de replis. Sur iOS, « Arial »
 * existe réellement ; sur Android, il n'existe pas et le système retombe
 * silencieusement sur Roboto — écart assumé, aucune police n'est embarquée dans
 * le bundle pour l'instant.
 *
 * Appliquée en `style` plutôt qu'en classe utilitaire : la moitié des vues
 * (menus contextuels, fenêtres, écrans d'authentification) est rendue par
 * `StyleSheet`, hors de portée de NativeWind.
 */
export const FONT_FAMILY: string = Platform.select({
  web: "Arial, Helvetica, sans-serif",
  default: "Arial",
});
