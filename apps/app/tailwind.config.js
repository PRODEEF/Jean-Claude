/** @type {import('tailwindcss').Config} */

/**
 * Configuration Tailwind / NativeWind.
 *
 * Les noms de couleurs sont ceux de shadcn : c'est la condition pour que les
 * composants copiés depuis react-native-reusables s'affichent sans retouche.
 * Aucune valeur n'est écrite ici — chaque jeton pointe vers une variable CSS
 * posée à l'exécution par `ThemeProvider` depuis la palette de `@jc/design`,
 * ce qui garde une source unique de couleurs et fait suivre la couleur
 * d'assistant choisie par l'utilisateur (§5.1).
 *
 * Attention au faux ami : le `accent` de shadcn est le fond de survol, pas la
 * couleur de marque. La couleur de marque de `@jc/design` est ici `primary`.
 */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  // `ThemeProvider` résout déjà clair/sombre et injecte la bonne palette. La
  // classe n'est jamais posée : sans cela, les variantes `dark:` des
  // composants shadcn s'appliqueraient par-dessus, et le thème serait décidé
  // à deux endroits.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        "accent-soft": {
          DEFAULT: "var(--accent-soft)",
          foreground: "var(--accent-soft-foreground)",
        },
        secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        accent: { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
        destructive: { DEFAULT: "var(--destructive)", foreground: "var(--destructive-foreground)" },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
      },
    },
  },
  plugins: [],
};
