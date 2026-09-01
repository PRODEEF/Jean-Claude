/**
 * Jetons de design.
 *
 * Valeurs numériques et non des classes CSS : elles doivent être consommables
 * aussi bien par `StyleSheet` (iOS/Android) que par le rendu web de
 * react-native-web. C'est la condition pour que web, mobile et desktop
 * partagent réellement une identité visuelle plutôt que deux thèmes qui
 * divergent silencieusement.
 */

/** Échelle d'espacement en pas de 4 — alignée sur les grilles iOS et Material. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

/**
 * Cible de taille tactile minimale : 44pt.
 *
 * Valeur des Human Interface Guidelines d'Apple, reprise par les critères
 * WCAG 2.1. Toute zone cliquable doit l'atteindre, y compris sur le web où
 * la souris tolérerait moins.
 */
export const MIN_TOUCH_TARGET = 44;

export type Palette = {
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  text: string;
  textMuted: string;
  /** Couleur de l'assistant — surchargée par la préférence utilisateur. */
  accent: string;
  accentText: string;
  /**
   * Version atténuée de l'accent, pour les larges aplats — la bulle de
   * l'utilisateur au premier chef.
   *
   * L'accent plein sur une bulle entière fatigue à la lecture : il est éclairci
   * en thème clair et assombri en thème sombre, de sorte que le texte y reste
   * dans la couleur du thème plutôt que d'être renversé.
   */
  accentSoft: string;
  accentSoftText: string;
  danger: string;
  success: string;
};

export const lightPalette: Palette = {
  background: "#FFFFFF",
  surface: "#F7F7F8",
  surfaceElevated: "#FFFFFF",
  border: "#E4E4E7",
  text: "#18181B",
  textMuted: "#71717A",
  accent: "#6366F1",
  accentText: "#FFFFFF",
  accentSoft: "#E3E4FC",
  accentSoftText: "#18181B",
  danger: "#DC2626",
  success: "#16A34A",
};

export const darkPalette: Palette = {
  background: "#0B0B0F",
  surface: "#17171C",
  surfaceElevated: "#1F1F26",
  border: "#2A2A33",
  text: "#FAFAFA",
  textMuted: "#A1A1AA",
  accent: "#818CF8",
  accentText: "#0B0B0F",
  accentSoft: "#242745",
  accentSoftText: "#FAFAFA",
  danger: "#F87171",
  success: "#4ADE80",
};

/** Couleur d'assistant par défaut, avant tout choix de l'utilisateur. */
export const DEFAULT_ACCENT = "#6366F1";
