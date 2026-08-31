import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { useTheme } from "@/shared/providers/theme-provider";
import { CodeStep } from "./components/CodeStep";
import { EmailStep } from "./components/EmailStep";
import { useSignIn } from "./hooks/use-sign-in";

/**
 * Connexion en deux temps : e-mail puis code à usage unique (§6.1).
 *
 * Inscription et reconnexion suivent exactement le même parcours — il n'y a
 * pas d'écran « créer un compte » distinct, ce qui est le standard des apps
 * de référence du §4.2 et évite à l'utilisateur d'avoir à savoir s'il possède
 * déjà un compte.
 */
export function SignInScreen() {
  const { palette } = useTheme();
  const signIn = useSignIn();

  const isBusy = signIn.status !== "idle";
  const actionLabel = signIn.step === "email" ? "Recevoir un code" : "Se connecter";

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: palette.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.content}>
          <Text style={[styles.title, { color: palette.text }]} accessibilityRole="header">
            Jean-Claude
          </Text>
          <Text style={[styles.subtitle, { color: palette.textMuted }]}>
            {signIn.step === "email"
              ? "Entrez votre adresse e-mail pour recevoir un code de connexion."
              : `Nous avons envoyé un code à ${signIn.sentTo}. Il reste valable 15 minutes.`}
          </Text>

          {signIn.step === "email" ? (
            <EmailStep
              value={signIn.email}
              onChange={signIn.setEmail}
              onSubmit={signIn.submit}
              editable={!isBusy}
            />
          ) : (
            <CodeStep
              value={signIn.code}
              onChange={signIn.setCode}
              onSubmit={signIn.submit}
              onResend={signIn.resend}
              onChangeEmail={signIn.changeEmail}
              resendIn={signIn.resendIn}
              editable={!isBusy}
            />
          )}

          {/* `role="alert"` fait annoncer le message par le lecteur d'écran
              sans qu'il ait à revenir dessus. */}
          {signIn.error ? (
            <Text style={[styles.message, { color: palette.danger }]} accessibilityRole="alert">
              {signIn.error}
            </Text>
          ) : null}
          {signIn.notice && !signIn.error ? (
            <Text style={[styles.message, { color: palette.success }]} accessibilityRole="alert">
              {signIn.notice}
            </Text>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: palette.accent,
                opacity: !signIn.canSubmit || isBusy ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}
            onPress={signIn.submit}
            disabled={!signIn.canSubmit || isBusy}
            accessibilityRole="button"
            accessibilityState={{ disabled: !signIn.canSubmit || isBusy, busy: isBusy }}
            accessibilityLabel={actionLabel}
          >
            {isBusy ? (
              <ActivityIndicator color={palette.accentText} />
            ) : (
              <Text style={[styles.buttonLabel, { color: palette.accentText }]}>{actionLabel}</Text>
            )}
          </Pressable>

          <Text style={[styles.legal, { color: palette.textMuted }]}>
            Aucun mot de passe à créer ni à retenir : le code reçu par e-mail suffit.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center" },
  content: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    gap: spacing.lg,
    // Borne la largeur sur grand écran : un formulaire étiré sur 1400 px est
    // illisible, et la même vue sert le web et le desktop.
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, textAlign: "center" },
  subtitle: { fontSize: fontSize.md, textAlign: "center", lineHeight: 22 },
  message: { fontSize: fontSize.sm, textAlign: "center", lineHeight: 20 },
  button: {
    height: MIN_TOUCH_TARGET + 4,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  legal: { fontSize: fontSize.xs, textAlign: "center", lineHeight: 18 },
});
