import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, spacing } from "@jc/design";
import { useTheme } from "@/shared/providers/theme-provider";

export type ConversationHeaderProps = {
  title: string;
  /** Retour vers la liste — n'a de sens que lorsque la barre latérale est escamotée. */
  onBack?: (() => void) | undefined;
  /** Commande de droite : le « … » d'une conversation, le « Passer » de l'accueil. */
  action?: ReactNode;
};

/**
 * Bandeau de tête d'un fil, conversation classique comme canal permanent.
 *
 * Partagé et non recopié : les deux écrans montrent la même chose — le titre du
 * fil et une commande — et deux bandeaux distincts avaient déjà divergé de
 * hauteur, de taille de titre et de largeur.
 *
 * Pleine largeur, et non bornée à 900 pt comme le fil : c'est un bandeau
 * d'écran, le titre se cale au bord gauche et la commande au bord droit. Le
 * suivre sur la largeur du fil les ramènerait tous deux vers le centre sur
 * grand écran, sans rien y gagner.
 */
export function ConversationHeader({ title, onBack, action }: ConversationHeaderProps) {
  const { palette } = useTheme();

  return (
    <View style={[styles.header, { borderBottomColor: palette.border }]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Revenir à la liste des conversations"
          style={styles.back}
        >
          <Text style={[styles.backLabel, { color: palette.accent }]}>Conversations</Text>
        </Pressable>
      ) : null}

      <View style={styles.titleRow}>
        <Text numberOfLines={1} style={[styles.title, { color: palette.text }]}>
          {title}
        </Text>
        {action}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    width: "100%",
  },
  back: { minHeight: MIN_TOUCH_TARGET, justifyContent: "center" },
  backLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
