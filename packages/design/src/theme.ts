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
    accentSoft: softenAccent(accent, scheme),
    accentSoftText: base.text,
  };
}

/**
 * Atténue l'accent pour les larges aplats.
 *
 * En thème clair on tire vers le blanc, en thème sombre vers le noir : dans les
 * deux cas la couleur perd assez de force pour que le texte du thème s'y pose
 * sans être renversé, tout en restant reconnaissable comme la couleur choisie.
 */
export function softenAccent(hex: string, scheme: ColorScheme): string {
  return scheme === "dark" ? mix(hex, "#000000", 0.72) : mix(hex, "#FFFFFF", 0.82);
}

/** Mélange deux couleurs, `ratio` étant la part de `target`. */
function mix(hex: string, target: string, ratio: number): string {
  const from = channels(hex);
  const to = channels(target);
  if (!from || !to) return hex;

  const blended = from.map((value, index) =>
    Math.round(value * (1 - ratio) + (to[index] ?? 0) * ratio),
  );
  return `#${blended.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function channels(hex: string): [number, number, number] | null {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return null;

  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
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
