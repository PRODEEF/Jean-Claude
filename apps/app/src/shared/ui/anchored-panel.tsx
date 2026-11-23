import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { radius, spacing } from "@jc/design";
import { useTheme } from "@/shared/providers/theme-provider";

export type AnchoredPanelProps = {
  /** Point d'ouverture, en coordonnées écran. */
  x: number;
  y: number;
  width?: number;
  /** Hauteur à réserver pour ne pas sortir de l'écran ; le panneau remonte sinon. */
  height?: number;
  children: ReactNode;
  onClose: () => void;
};

const EDGE = spacing.sm;

/**
 * Petit panneau posé à l'endroit de l'appui, sans titre ni boutons : ce qu'on y
 * règle s'enregistre aussitôt, comme une liste déroulante (demande de Yann,
 * 23 novembre).
 *
 * Même structure que `ContextMenu`, mais le contenu est libre. Les variables du
 * thème sont reposées : la fenêtre s'affiche hors de l'arbre où
 * `ThemeProvider` les pose, et les classes utilitaires des champs qu'elle
 * porte retomberaient sur le thème clair.
 */
export function AnchoredPanel({
  x,
  y,
  width = 280,
  height = 240,
  children,
  onClose,
}: AnchoredPanelProps) {
  const { palette, cssVariables } = useTheme();
  const window = useWindowDimensions();
  const left = Math.max(EDGE, Math.min(x, window.width - width - EDGE));
  const top = Math.max(EDGE, Math.min(y, window.height - height - EDGE));

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Fermer"
      />
      <View
        style={[
          styles.panel,
          cssVariables,
          {
            left,
            top,
            width,
            backgroundColor: palette.surfaceElevated,
            borderColor: palette.border,
          },
        ]}
      >
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.18)",
  },
});
