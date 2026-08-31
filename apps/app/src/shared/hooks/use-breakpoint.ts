import { useWindowDimensions } from "react-native";

/**
 * Point de rupture de mise en page.
 *
 * C'est le mécanisme qui permet à un codebase unique de servir les trois
 * cibles sans les confondre (§4.5 : « adapter aux patterns natifs plutôt que
 * recopier ») : en `compact`, la navigation passe par un tiroir et des onglets ;
 * en `expanded`, la sidebar de dossiers est affichée en permanence, comme sur
 * la maquette web.
 *
 * Le seuil de 768 pt sépare téléphone d'un côté, tablette et desktop de l'autre.
 */
export type Breakpoint = "compact" | "expanded";

export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  return width >= 768 ? "expanded" : "compact";
}
