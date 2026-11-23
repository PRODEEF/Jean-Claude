import type { ReactNode } from "react";
import { Pressable } from "react-native";

export type InlinePickerProps = {
  mode: "date" | "time";
  value: string;
  onChange: (value: string) => void;
  accessibilityLabel: string;
  children: ReactNode;
  /** Ouvre le panneau de réglage : sur téléphone, pas de sélecteur à poser sous le libellé. */
  onNativePress?: (event: GestureResponderEventLike) => void;
};

type GestureResponderEventLike = { nativeEvent: { pageX: number; pageY: number } };

/**
 * Version iOS et Android : un appui ouvre le panneau de réglage de la carte
 * (`ListDuePanel`). La version web ouvre le sélecteur du navigateur sur place,
 * voir `inline-picker.web.tsx`.
 */
export function InlinePicker({ accessibilityLabel, children, onNativePress }: InlinePickerProps) {
  return (
    <Pressable
      onPress={onNativePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Pressable>
  );
}
