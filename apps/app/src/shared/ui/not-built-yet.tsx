import { StyleSheet, Text, View } from "react-native";
import { fontSize, fontWeight, radius, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useTheme } from "@/shared/providers/theme-provider";

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
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
  },
  cardTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  cardItem: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm, lineHeight: 20 },
});
