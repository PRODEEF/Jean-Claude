import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useTheme } from "@/shared/providers/theme-provider";

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  /** Seconde ligne, sous le libellé — le bénéfice d'un modèle, par exemple. */
  description?: string;
};

export type SelectProps<T extends string> = {
  /**
   * `string` et non `T` : la valeur active peut, avant tout choix de
   * l'utilisateur, venir d'ailleurs que ce catalogue d'options — ici, du
   * modèle par défaut que sert le serveur.
   */
  value: string | null;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** Affiché tant qu'aucune valeur n'est choisie. */
  placeholder: string;
  disabled?: boolean;
  accessibilityLabel: string;
};

/** Espace entre le déclencheur et la liste, et marge minimale au bord de l'écran. */
const GAP = spacing.xs;
const EDGE = spacing.sm;
/** Assez pour un libellé et sa description sur une ligne chacun. */
const ROW_HEIGHT = 56;

type Anchor = { x: number; y: number; width: number; height: number };

/**
 * Liste déroulante ancrée sous son déclencheur.
 *
 * Écrite ici plutôt qu'empruntée à react-native-reusables : son `select` tient
 * à `@rn-primitives/select`, une dépendance de plus pour un déclencheur, un
 * fond cliquable et une liste d'options — le même calcul que celui déjà fait
 * pour le menu contextuel de la barre latérale (`context-menu.tsx`), dont ce
 * composant reprend la structure.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  accessibilityLabel,
}: SelectProps<T>) {
  const { palette } = useTheme();
  const window = useWindowDimensions();
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const selected = options.find((option) => option.value === value) ?? null;

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  };

  const closeMenu = () => setAnchor(null);

  const height = options.length * ROW_HEIGHT + spacing.xs * 2;
  // Sous le déclencheur, sauf si la liste devait déborder en bas de l'écran :
  // elle remonte alors au-dessus plutôt que de sortir de l'écran.
  const top = anchor
    ? anchor.y + anchor.height + GAP + height > window.height - EDGE
      ? Math.max(EDGE, anchor.y - height - GAP)
      : anchor.y + anchor.height + GAP
    : 0;

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={openMenu}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[styles.trigger, { borderColor: palette.border, opacity: disabled ? 0.5 : 1 }]}
      >
        <Text
          numberOfLines={1}
          style={[styles.triggerText, { color: selected ? palette.text : palette.textMuted }]}
        >
          {selected?.label ?? placeholder}
        </Text>
        <ChevronDown size={16} color={palette.textMuted} />
      </Pressable>

      {anchor ? (
        <Modal transparent visible animationType="none" onRequestClose={closeMenu}>
          {/* Le fond couvre l'écran : un appui n'importe où referme, comme le
              menu contextuel de la barre latérale. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeMenu}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
          />

          <View
            style={[
              styles.menu,
              {
                left: anchor.x,
                top,
                width: anchor.width,
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.border,
              },
            ]}
            accessibilityRole="radiogroup"
          >
            {options.map((option) => {
              const isSelected = option.value === value;

              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    onChange(option.value);
                    closeMenu();
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={option.label}
                  style={({ pressed }) => [
                    styles.item,
                    pressed ? { backgroundColor: palette.surface } : null,
                  ]}
                >
                  <View style={styles.itemText}>
                    <Text numberOfLines={1} style={[styles.label, { color: palette.text }]}>
                      {option.label}
                    </Text>
                    {option.description ? (
                      <Text
                        numberOfLines={1}
                        style={[styles.description, { color: palette.textMuted }]}
                      >
                        {option.description}
                      </Text>
                    ) : null}
                  </View>
                  {isSelected ? <Check size={16} color={palette.accent} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  triggerText: { fontFamily: FONT_FAMILY, fontSize: fontSize.md, flexShrink: 1 },
  menu: {
    position: "absolute",
    padding: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.18)",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: ROW_HEIGHT,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  itemText: { flex: 1, gap: 2 },
  label: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  description: { fontFamily: FONT_FAMILY, fontSize: fontSize.xs },
});
