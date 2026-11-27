import { Pressable, StyleSheet, Text as NativeText, View } from "react-native";
import { fontSize } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useTheme } from "@/shared/providers/theme-provider";

const TRACK_WIDTH = 60;
const TRACK_HEIGHT = 30;
const THUMB = 22;
const MARGIN = 4;

type SwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/**
 * Interrupteur « ON » vert / « OFF » rouge (Yann, 27 novembre) : l'état se lit
 * d'un coup d'œil, sans deviner de quel côté est le bouton. Le mot est écrit sur
 * le rail, du côté opposé au bouton.
 *
 * Remplace l'interrupteur natif parce que celui-ci ne porte pas de texte. Centralisé :
 * les six interrupteurs de l'application le partagent, ils ne divergent pas.
 */
export function Switch({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
}: SwitchProps) {
  const { palette } = useTheme();

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      // 30 pt de rail, mais la zone d'appui reste celle d'un doigt.
      hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      // Le web ne relit plus `accessibilityState` : sans ceci, un lecteur d'écran
      // ne dirait pas si l'interrupteur est activé.
      aria-checked={value}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      style={[
        styles.track,
        { backgroundColor: value ? palette.switchOn : palette.switchOff },
        disabled ? styles.disabled : null,
      ]}
    >
      <NativeText
        style={[
          styles.label,
          value ? styles.labelLeft : styles.labelRight,
          // Le noir sur le vert, le blanc sur le rouge : les deux restent lisibles.
          { color: value ? "#0B0B0F" : "#FFFFFF" },
        ]}
      >
        {value ? "ON" : "OFF"}
      </NativeText>
      <View style={[styles.thumb, value ? styles.thumbRight : styles.thumbLeft]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    justifyContent: "center",
  },
  disabled: { opacity: 0.5 },
  thumb: {
    position: "absolute",
    top: (TRACK_HEIGHT - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: "#FFFFFF",
  },
  thumbLeft: { left: MARGIN },
  thumbRight: { right: MARGIN },
  label: {
    position: "absolute",
    fontFamily: FONT_FAMILY,
    fontSize: fontSize.xs,
    fontWeight: "700",
  },
  labelLeft: { left: 9 },
  labelRight: { right: 8 },
});
