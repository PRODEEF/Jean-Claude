import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
  /**
   * Les variables CSS de la palette, à reposer sur une vue rendue hors de
   * l'arbre : sur web, une fenêtre modale s'affiche dans `document.body` et
   * n'hérite pas de celles que ce fournisseur pose sur ses enfants.
   */
  cssVariables: ReturnType<typeof vars>;
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

  /**
   * Le réglage de l'appareil n'est suivi qu'une fois le premier rendu posé.
   *
   * Le web est pré-rendu à la construction (`web.output: "static"`), sans
   * appareil à interroger : le HTML naît en clair. À l'hydratation, React
   * adopte ce HTML sans en corriger les attributs — les variables posées
   * ci-dessous restaient donc claires sur un appareil en sombre, alors que la
   * palette, elle, passait en sombre : barre latérale claire à côté d'un fil
   * noir. Rejouer d'abord le rendu du serveur fait de la bascule une mise à
   * jour ordinaire, que React applique. `useLayoutEffect` la place avant le
   * premier affichage : aucun éclair clair à l'écran.
   */
  const [hydrated, setHydrated] = useState(false);
  useLayoutEffect(() => setHydrated(true), []);

  const { scheme, palette } = useMemo(() => {
    const deviceScheme: ColorScheme = hydrated && systemScheme === "dark" ? "dark" : "light";
    const scheme: ColorScheme = preference === "system" ? deviceScheme : preference;
    return { scheme, palette: buildPalette(scheme, accent) };
  }, [preference, systemScheme, accent, hydrated]);

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
        "--background": palette.background,
        "--foreground": palette.text,
        "--card": palette.surfaceElevated,
        "--card-foreground": palette.text,
        "--popover": palette.surfaceElevated,
        "--popover-foreground": palette.text,
        // La couleur de marque de `@jc/design` s'appelle `accent` ; chez
        // shadcn elle s'appelle `primary`, `accent` y désignant le fond de
        // survol. Le croisement se fait ici, une fois pour toutes.
        "--primary": palette.accent,
        "--primary-foreground": palette.accentText,
        // Hors nomenclature shadcn, qui n'a pas d'équivalent : la teinte
        // atténuée des larges aplats — bulle de l'utilisateur, bannière.
        "--accent-soft": palette.accentSoft,
        "--accent-soft-foreground": palette.accentSoftText,
        "--secondary": palette.surface,
        "--secondary-foreground": palette.text,
        "--muted": palette.surface,
        "--muted-foreground": palette.textMuted,
        "--accent": palette.surface,
        "--accent-foreground": palette.text,
        "--destructive": palette.danger,
        "--destructive-foreground": readableTextOn(palette.danger),
        "--border": palette.border,
        "--input": palette.border,
        "--ring": palette.accent,
      }),
    [palette],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ scheme, palette, cssVariables }),
    [scheme, palette, cssVariables],
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
