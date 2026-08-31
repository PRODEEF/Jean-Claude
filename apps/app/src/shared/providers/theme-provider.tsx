import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { buildPalette, DEFAULT_ACCENT, type ColorScheme, type Palette } from "@jc/design";
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

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme doit être utilisé à l'intérieur de <ThemeProvider>.");
  }
  return context;
}
