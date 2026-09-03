import { StyleSheet, TextInput } from "react-native";
import { fontSize, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useTheme } from "@/shared/providers/theme-provider";

export type EmailStepProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  editable: boolean;
};

/** Étape 1 — saisie de l'adresse à laquelle envoyer le code. */
export function EmailStep({ value, onChange, onSubmit, editable }: EmailStepProps) {
  const { palette } = useTheme();

  return (
    <TextInput
      style={[
        styles.input,
        { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
      ]}
      value={value}
      onChangeText={onChange}
      placeholder="vous@exemple.fr"
      placeholderTextColor={palette.textMuted}
      keyboardType="email-address"
      autoCapitalize="none"
      autoComplete="email"
      textContentType="emailAddress"
      autoCorrect={false}
      autoFocus
      returnKeyType="send"
      editable={editable}
      onSubmitEditing={onSubmit}
      accessibilityLabel="Adresse e-mail"
    />
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: FONT_FAMILY,
    height: MIN_TOUCH_TARGET + 4,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.md,
  },
});
