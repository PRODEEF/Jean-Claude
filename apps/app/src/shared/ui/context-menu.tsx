import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { fontSize, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useTheme } from "@/shared/providers/theme-provider";

/** Une entrée du menu. */
export type ContextMenuItem = {
  label: string;
  onPress: () => void;
  /** Rouge, et séparée de ce qui précède : une suppression ne se rattrape pas. */
  destructive?: boolean;
};

export type ContextMenuProps = {
  /** Point d'ouverture, en coordonnées écran. */
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

const MENU_WIDTH = 220;
/** Marge minimale au bord de la fenêtre, pour que le menu ne soit jamais coupé. */
const EDGE = spacing.sm;
/** Hauteur d'une entrée, séparateur compris pour la première destructive. */
const ITEM_HEIGHT = MIN_TOUCH_TARGET;
const SEPARATOR_HEIGHT = 1 + spacing.xs * 2;

/**
 * Menu contextuel, ouvert au curseur ou au doigt.
 *
 * Écrit ici plutôt qu'emprunté : le `context-menu` de react-native-reusables
 * tient à `@rn-primitives/context-menu`, une dépendance de plus pour quelques
 * rangées et un fond cliquable. Les couleurs viennent de `useTheme` et non de
 * classes utilitaires : `Modal` s'affiche hors de l'arbre où `ThemeProvider`
 * pose ses variables CSS, qui n'y parviendraient donc pas sur web.
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const { palette } = useTheme();
  const window = useWindowDimensions();

  // Le menu s'ouvre au curseur, sauf s'il devait déborder : il se replie alors
  // vers l'intérieur plutôt que de sortir de l'écran.
  const height =
    items.length * ITEM_HEIGHT +
    items.filter((item) => item.destructive).length * SEPARATOR_HEIGHT +
    spacing.xs * 2;
  const left = Math.max(EDGE, Math.min(x, window.width - MENU_WIDTH - EDGE));
  const top = Math.max(EDGE, Math.min(y, window.height - height - EDGE));

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      {/* Le fond couvre l'écran : un clic n'importe où referme, comme tout menu
          contextuel — et il intercepte le second clic droit, qui rouvrirait
          sinon le menu du navigateur par-dessus. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Fermer le menu"
      />

      <View
        style={[
          styles.menu,
          { left, top, backgroundColor: palette.surfaceElevated, borderColor: palette.border },
        ]}
      >
        {items.map((item) => (
          <View key={item.label}>
            {item.destructive ? (
              <View style={[styles.separator, { backgroundColor: palette.border }]} />
            ) : null}
            <MenuItem item={item} />
          </View>
        ))}
      </View>
    </Modal>
  );
}

function MenuItem({ item }: { item: ContextMenuItem }) {
  const { palette } = useTheme();

  return (
    <Pressable
      onPress={item.onPress}
      accessibilityRole="menuitem"
      style={({ pressed }) => [styles.item, pressed ? { backgroundColor: palette.surface } : null]}
    >
      <Text
        numberOfLines={1}
        style={[styles.label, { color: item.destructive ? palette.danger : palette.text }]}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    width: MENU_WIDTH,
    padding: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    // Ombre portée : le menu flotte au-dessus de la barre latérale, dont il
    // reprendrait sinon le fond à un ton près.
    // `boxShadow` plutôt que les `shadow*` + `elevation` d'autrefois : ces
    // derniers sont dépréciés par react-native-web, et la nouvelle
    // architecture rend `boxShadow` sur les trois plateformes.
    boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.18)",
  },
  item: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  label: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm },
  separator: { height: 1, marginVertical: spacing.xs },
});
