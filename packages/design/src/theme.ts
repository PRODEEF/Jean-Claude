import { darkPalette, lightPalette, type Palette } from "./tokens";

export type ColorScheme = "light" | "dark";

/**
 * Construit la palette effective.
 *
 * La couleur choisie par l'utilisateur pour l'assistant (panneau de paramètres)
 * remplace l'accent par défaut. Elle n'est appliquée qu'à `accent` : laisser
 * une couleur arbitraire se propager aux fonds ou aux textes casserait les
 * contrastes, et donc l'accessibilité.
 */
export function buildPalette(scheme: ColorScheme, accent?: string): Palette {
  const base = scheme === "dark" ? darkPalette : lightPalette;
  if (!accent) return base;

  return {
    ...base,
    accent,
    // Le texte posé sur l'accent est recalculé pour rester lisible quelle que
    // soit la couleur retenue.
    accentText: readableTextOn(accent),
  };
}

/**
 * Noir ou blanc selon la luminance relative du fond (WCAG 2.1).
 *
 * Le seuil 0,5 est une approximation volontairement simple : elle suffit à
 * garantir un contraste confortable sur les couleurs d'accent usuelles, sans
 * embarquer une bibliothèque de colorimétrie dans le bundle mobile.
 */
export function readableTextOn(hex: string): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return "#FFFFFF";

  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  const linear = (c: number): number =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return luminance > 0.5 ? "#18181B" : "#FFFFFF";
}
