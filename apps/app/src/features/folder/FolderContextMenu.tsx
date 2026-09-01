import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { MAX_FOLDER_DEPTH, type Folder } from "@jc/domain";
import { fontSize, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { useTheme } from "@/shared/providers/theme-provider";

/** Dossier visé et point où le menu doit s'ouvrir, en coordonnées écran. */
export type FolderMenuTarget = {
  folder: Folder;
  /** 1 pour un dossier racine — dit s'il peut encore accueillir un sous-dossier. */
  depth: number;
  x: number;
  y: number;
};

export type FolderContextMenuProps = {
  /** `null` = menu fermé. */
  target: FolderMenuTarget | null;
  onClose: () => void;
  onRename: (target: FolderMenuTarget) => void;
  onAddChild: (target: FolderMenuTarget) => void;
  onDelete: (target: FolderMenuTarget) => void;
};

const MENU_WIDTH = 220;
/** Marge minimale au bord de la fenêtre, pour que le menu ne soit jamais coupé. */
const EDGE = spacing.sm;

/**
 * Menu contextuel d'un dossier.
 *
 * Écrit ici plutôt qu'emprunté : le `context-menu` de react-native-reusables
 * tient à `@rn-primitives/context-menu`, une dépendance de plus pour trois
 * rangées et un fond cliquable. Les couleurs viennent de `useTheme` et non de
 * classes utilitaires : `Modal` s'affiche hors de l'arbre où `ThemeProvider`
 * pose ses variables CSS, qui n'y parviendraient donc pas sur web.
 */
export function FolderContextMenu({
  target,
  onClose,
  onRename,
  onAddChild,
  onDelete,
}: FolderContextMenuProps) {
  const { palette } = useTheme();
  const window = useWindowDimensions();

  if (!target) return null;

  // Le menu s'ouvre au curseur, sauf s'il devait déborder : il se replie alors
  // vers l'intérieur plutôt que de sortir de l'écran.
  const height = target.depth < MAX_FOLDER_DEPTH ? 168 : 124;
  const left = Math.max(EDGE, Math.min(target.x, window.width - MENU_WIDTH - EDGE));
  const top = Math.max(EDGE, Math.min(target.y, window.height - height - EDGE));

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
          {
            left,
            top,
            backgroundColor: palette.surfaceElevated,
            borderColor: palette.border,
          },
        ]}
      >
        <MenuItem label="Renommer" onPress={() => onRename(target)} />

        {/* L'arborescence est bornée à `MAX_FOLDER_DEPTH` niveaux : au dernier,
            un sous-dossier ne rentre plus. Le serveur le refuse déjà, autant ne
            pas proposer le geste. */}
        {target.depth < MAX_FOLDER_DEPTH ? (
          <MenuItem label="Ajouter un sous-dossier" onPress={() => onAddChild(target)} />
        ) : null}

        <View style={[styles.separator, { backgroundColor: palette.border }]} />

        <MenuItem label="Supprimer" destructive onPress={() => onDelete(target)} />
      </View>
    </Modal>
  );
}

function MenuItem({
  label,
  destructive,
  onPress,
}: {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      style={({ pressed }) => [
        styles.item,
        pressed ? { backgroundColor: palette.surface } : null,
      ]}
    >
      <Text style={[styles.label, { color: destructive ? palette.danger : palette.text }]}>
        {label}
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
    elevation: 8,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  item: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  label: { fontSize: fontSize.sm },
  separator: { height: 1, marginVertical: spacing.xs },
});
