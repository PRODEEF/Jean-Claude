import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { fontSize, fontWeight, radius, spacing } from "@jc/design";
import { useTheme } from "@/shared/providers/theme-provider";

export type ScreenScaffoldProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
};

/**
 * Ossature commune des écrans : encoche, largeur maximale, en-tête.
 *
 * La borne de largeur est ce qui rend la même vue supportable sur un écran
 * desktop large sans écrire de variante web dédiée.
 */
export function ScreenScaffold({ title, subtitle, children }: ScreenScaffoldProps) {
  const { palette } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: palette.textMuted }]}>{subtitle}</Text>
        ) : null}
        {children}
      </ScrollView>
    </View>
  );
}

/**
 * Marque un écran non encore développé.
 *
 * Rend visible dans l'app elle-même ce qui reste à faire et à quelle phase du
 * §3 cela appartient — plus fiable qu'un TODO enfoui dans le code pour la
 * démonstration quotidienne demandée au §0.1.
 */
export function NotBuiltYet({ phase, items }: { phase: string; items: string[] }) {
  const { palette } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Text style={[styles.cardTitle, { color: palette.textMuted }]}>À développer — {phase}</Text>
      {items.map((item) => (
        <Text key={item} style={[styles.cardItem, { color: palette.text }]}>
          • {item}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
  },
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold },
  subtitle: { fontSize: fontSize.md, lineHeight: 22 },
  card: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
  },
  cardTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  cardItem: { fontSize: fontSize.sm, lineHeight: 20 },
});
