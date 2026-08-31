import { createContext, useContext, useMemo, type ReactNode } from "react";
import { StyleSheet, useColorScheme, View } from "react-native";
import { vars } from "nativewind";
import {
  buildPalette,
  DEFAULT_ACCENT,
  readableTextOn,
  type ColorScheme,
  type Palette,
} from "@jc/design";
import type { Theme } from "@jc/domain";

type ThemeContextValue = {
  palette: Palette;
  scheme: ColorScheme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export type ThemeProviderProps = {
  children: ReactNode;
  /** Préférence de l'utilisateur ; `system` suit le réglage de l'OS. */
  preference?: Theme;
  /** Couleur de l'assistant choisie dans les paramètres. */
  accent?: string;
};

export function ThemeProvider({
  children,
  preference = "system",
  accent = DEFAULT_ACCENT,
}: ThemeProviderProps) {
  const systemScheme = useColorScheme();

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: ColorScheme =
      preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;
    return { scheme, palette: buildPalette(scheme, accent) };
  }, [preference, systemScheme, accent]);

  /**
   * La même palette, exposée aux classes utilitaires de NativeWind.
   *
   * Les composants react-native-reusables se stylent en `className`, les
   * écrans existants en `StyleSheet` : sans cette passerelle, les deux
   * dériveraient. Les variables sont posées ici plutôt qu'en dur dans
   * `tailwind.config.js`, ce qui fait que la couleur d'assistant choisie par
   * l'utilisateur se propage aussi aux classes.
   */
  const cssVariables = useMemo(
    () =>
      vars({
        "--background": value.palette.background,
        "--foreground": value.palette.text,
        "--card": value.palette.surfaceElevated,
        "--card-foreground": value.palette.text,
        "--popover": value.palette.surfaceElevated,
        "--popover-foreground": value.palette.text,
        // La couleur de marque de `@jc/design` s'appelle `accent` ; chez
        // shadcn elle s'appelle `primary`, `accent` y désignant le fond de
        // survol. Le croisement se fait ici, une fois pour toutes.
        "--primary": value.palette.accent,
        "--primary-foreground": value.palette.accentText,
        "--secondary": value.palette.surface,
        "--secondary-foreground": value.palette.text,
        "--muted": value.palette.surface,
        "--muted-foreground": value.palette.textMuted,
        "--accent": value.palette.surface,
        "--accent-foreground": value.palette.text,
        "--destructive": value.palette.danger,
        "--destructive-foreground": readableTextOn(value.palette.danger),
        "--border": value.palette.border,
        "--input": value.palette.border,
        "--ring": value.palette.accent,
      }),
    [value.palette],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={[styles.root, cssVariables]}>{children}</View>
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme doit être utilisé à l'intérieur de <ThemeProvider>.");
  }
  return context;
}
