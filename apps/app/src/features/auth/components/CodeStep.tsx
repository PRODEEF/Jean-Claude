import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { fontSize, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { OTP_CODE_LENGTH } from "@jc/domain";
import { useTheme } from "@/shared/providers/theme-provider";

export type CodeStepProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  onChangeEmail: () => void;
  /** Secondes avant qu'un nouveau code puisse être demandé ; `0` = possible. */
  resendIn: number;
  editable: boolean;
};

/** Étape 2 — saisie du code reçu par e-mail. */
export function CodeStep({
  value,
  onChange,
  onSubmit,
  onResend,
  onChangeEmail,
  resendIn,
  editable,
}: CodeStepProps) {
  const { palette } = useTheme();

  const canResend = editable && resendIn === 0;
  const resendLabel = canResend ? "Renvoyer le code" : `Nouveau code possible dans ${resendIn} s`;

  return (
    <View style={styles.root}>
      <TextInput
        style={[
          styles.input,
          { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={"0".repeat(OTP_CODE_LENGTH)}
        placeholderTextColor={palette.textMuted}
        keyboardType="number-pad"
        inputMode="numeric"
        // Active le remplissage automatique du code depuis l'e-mail sur iOS.
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        maxLength={OTP_CODE_LENGTH}
        editable={editable}
        onSubmitEditing={onSubmit}
        accessibilityLabel={`Code de connexion à ${OTP_CODE_LENGTH} chiffres`}
      />

      <View style={styles.actions}>
        <Pressable
          onPress={onResend}
          disabled={!canResend}
          hitSlop={spacing.sm}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canResend }}
          accessibilityLabel={resendLabel}
        >
          <Text style={[styles.link, { color: canResend ? palette.accent : palette.textMuted }]}>
            {resendLabel}
          </Text>
        </Pressable>

        <Pressable
          onPress={onChangeEmail}
          disabled={!editable}
          hitSlop={spacing.sm}
          accessibilityRole="button"
          accessibilityLabel="Modifier l'adresse e-mail"
        >
          <Text style={[styles.link, { color: palette.textMuted }]}>
            Modifier l&apos;adresse e-mail
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  input: {
    height: MIN_TOUCH_TARGET + 4,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.xl,
    textAlign: "center",
    // Espace les chiffres pour qu'un code se relise sans les recompter.
    letterSpacing: spacing.sm,
  },
  actions: { gap: spacing.md, alignItems: "center" },
  link: { fontSize: fontSize.sm, textAlign: "center", lineHeight: 20 },
});
