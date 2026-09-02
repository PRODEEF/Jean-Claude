import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowRight } from "lucide-react-native";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { useTheme } from "@/shared/providers/theme-provider";

export type SwitchAsideCardProps = {
  /** Titre du fil qui accueillera la demande. */
  title: string;
  onSwitch: () => void;
  isPending: boolean;
};

/**
 * Validation d'une bascule vers une conversation dédiée (A.10).
 *
 * Le canal permanent couvre trois sujets ; tout le reste relève d'une
 * conversation classique. Le fil dédié n'est ouvert qu'ici, sur le geste de
 * l'utilisateur : l'assistant propose, il n'exécute pas (§12.1).
 *
 * Un seul bouton, et pas d'« Ignorer » : la demande sort du périmètre du canal,
 * il n'y a donc pas de « rester ici » qui tienne — la seule autre issue est de
 * passer à autre chose, ce que le champ de saisie permet déjà.
 */
export function SwitchAsideCard({ title, onSwitch, isPending }: SwitchAsideCardProps) {
  const { palette } = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
      ]}
    >
      <Text numberOfLines={2} style={[styles.title, { color: palette.text }]}>
        {title}
      </Text>

      <Pressable
        onPress={onSwitch}
        disabled={isPending}
        accessibilityRole="button"
        accessibilityLabel={`Basculer vers la conversation « ${title} »`}
        style={[styles.action, { backgroundColor: palette.accent, opacity: isPending ? 0.4 : 1 }]}
      >
        {isPending ? (
          <ActivityIndicator size="small" color={palette.accentText} />
        ) : (
          <>
            <Text style={[styles.actionLabel, { color: palette.accentText }]}>Basculer</Text>
            <ArrowRight size={14} color={palette.accentText} />
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  title: { flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET - spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  actionLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
