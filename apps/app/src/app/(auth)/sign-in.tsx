import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { useAuth } from "@/shared/providers/auth-provider";
import { useTheme } from "@/shared/providers/theme-provider";

type Step = "email" | "code";

/**
 * Connexion en deux temps : e-mail puis code à usage unique (§6.1).
 *
 * Inscription et reconnexion suivent exactement le même parcours — il n'y a
 * pas d'écran « créer un compte » distinct, ce qui est le standard des apps
 * de référence du §4.2 et évite à l'utilisateur d'avoir à savoir s'il a déjà
 * un compte.
 */
export default function SignInScreen() {
  const { palette } = useTheme();
  const { requestCode, verifyCode } = useAuth();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setIsPending(true);
    try {
      if (step === "email") {
        await requestCode(email.trim());
        setStep("code");
      } else {
        await verifyCode(email.trim(), code.trim());
        // La redirection est prise en charge par `AuthGate` dès que la session
        // change : pas de navigation impérative ici.
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Une erreur est survenue.");
    } finally {
      setIsPending(false);
    }
  }

  const canSubmit =
    step === "email" ? /^\S+@\S+\.\S+$/.test(email.trim()) : code.trim().length >= 6;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: palette.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: palette.text }]}>Jean-Claude</Text>
        <Text style={[styles.subtitle, { color: palette.textMuted }]}>
          {step === "email"
            ? "Entrez votre adresse e-mail pour recevoir un code de connexion."
            : `Nous avons envoyé un code à ${email}.`}
        </Text>

        {step === "email" ? (
          <TextInput
            style={[
              styles.input,
              { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
            ]}
            value={email}
            onChangeText={setEmail}
            placeholder="vous@exemple.fr"
            placeholderTextColor={palette.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            editable={!isPending}
            onSubmitEditing={() => canSubmit && void handleSubmit()}
          />
        ) : (
          <TextInput
            style={[
              styles.input,
              styles.codeInput,
              { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
            ]}
            value={code}
            onChangeText={setCode}
            placeholder="000000"
            placeholderTextColor={palette.textMuted}
            keyboardType="number-pad"
            // Permet le remplissage automatique depuis le SMS/e-mail sur iOS.
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={8}
            editable={!isPending}
            onSubmitEditing={() => canSubmit && void handleSubmit()}
          />
        )}

        {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: palette.accent,
              opacity: !canSubmit || isPending ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
          onPress={() => void handleSubmit()}
          disabled={!canSubmit || isPending}
          accessibilityRole="button"
          accessibilityLabel={step === "email" ? "Recevoir un code" : "Se connecter"}
        >
          {isPending ? (
            <ActivityIndicator color={palette.accentText} />
          ) : (
            <Text style={[styles.buttonLabel, { color: palette.accentText }]}>
              {step === "email" ? "Recevoir un code" : "Se connecter"}
            </Text>
          )}
        </Pressable>

        {step === "code" ? (
          <Pressable
            onPress={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            accessibilityRole="button"
          >
            <Text style={[styles.link, { color: palette.textMuted }]}>
              Modifier l&apos;adresse e-mail
            </Text>
          </Pressable>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center" },
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
    // Borne la largeur sur grand écran : un formulaire étiré sur 1400 px est
    // illisible, et la même vue sert le web et le desktop.
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, textAlign: "center" },
  subtitle: { fontSize: fontSize.md, textAlign: "center", lineHeight: 22 },
  input: {
    height: MIN_TOUCH_TARGET + 4,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.md,
  },
  codeInput: { textAlign: "center", fontSize: fontSize.xl, letterSpacing: 8 },
  button: {
    height: MIN_TOUCH_TARGET + 4,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  error: { fontSize: fontSize.sm, textAlign: "center" },
  link: { fontSize: fontSize.sm, textAlign: "center" },
});
