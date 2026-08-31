import { useCallback, useEffect, useRef, useState } from "react";
import {
  isCompleteOtpCode,
  isValidEmail,
  normalizeOtpCode,
  OTP_RESEND_COOLDOWN_SECONDS,
} from "@jc/domain";
import { useAuth } from "@/shared/providers/auth-provider";
import { useCountdown } from "./use-countdown";

export type SignInStep = "email" | "code";

type Status = "idle" | "sending" | "verifying";

export type SignInState = {
  step: SignInStep;
  email: string;
  code: string;
  /** Adresse à laquelle le code a effectivement été envoyé. */
  sentTo: string;
  status: Status;
  error: string | null;
  notice: string | null;
  /** La saisie courante est-elle exploitable ? Pilote le bouton principal. */
  canSubmit: boolean;
  /** Secondes avant de pouvoir redemander un code ; `0` = possible. */
  resendIn: number;
  setEmail: (value: string) => void;
  setCode: (value: string) => void;
  submit: () => void;
  resend: () => void;
  changeEmail: () => void;
};

/**
 * Machine à états de la connexion en deux temps (§6.1).
 *
 * Toute la logique du parcours est ici et non dans l'écran : c'est elle qui
 * doit valoir identiquement sur les quatre plateformes, alors que la
 * présentation, elle, peut légitimement diverger.
 */
export function useSignIn(): SignInState {
  const { requestCode, verifyCode } = useAuth();

  const [step, setStep] = useState<SignInStep>("email");
  const [email, setEmailInput] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCodeInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { remaining: resendIn, start: startCooldown, reset: resetCooldown } = useCountdown();

  /**
   * Dernier code soumis.
   *
   * Un code refusé reste affiché dans le champ. Sans cette mémoire, l'envoi
   * automatique le resoumettrait en boucle dès le retour à l'état `idle`.
   */
  const lastAttemptRef = useRef<string | null>(null);

  const setEmail = useCallback((value: string) => {
    setEmailInput(value);
    setError(null);
  }, []);

  const setCode = useCallback((value: string) => {
    // Le champ n'affiche jamais autre chose que ce qui sera réellement vérifié.
    setCodeInput(normalizeOtpCode(value));
    setError(null);
  }, []);

  const sendCode = useCallback(
    async (address: string, isResend: boolean) => {
      setError(null);
      setNotice(null);
      setStatus("sending");
      try {
        await requestCode(address);
        setSentTo(address);
        setStep("code");
        setCodeInput("");
        lastAttemptRef.current = null;
        startCooldown(OTP_RESEND_COOLDOWN_SECONDS);
        if (isResend) setNotice("Un nouveau code vient de vous être envoyé.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Une erreur est survenue.");
      } finally {
        setStatus("idle");
      }
    },
    [requestCode, startCooldown],
  );

  const submitCode = useCallback(async () => {
    const attempt = code;
    lastAttemptRef.current = attempt;
    setError(null);
    setNotice(null);
    setStatus("verifying");
    try {
      // L'adresse vérifiée est celle à laquelle le code a été envoyé, pas la
      // saisie courante : les deux appels doivent porter sur la même chaîne.
      await verifyCode(sentTo, attempt);
      // La redirection est prise en charge par `AuthGate` dès que la session
      // change : pas de navigation impérative ici.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Une erreur est survenue.");
    } finally {
      setStatus("idle");
    }
  }, [code, sentTo, verifyCode]);

  const submit = useCallback(() => {
    if (status !== "idle") return;
    if (step === "email") {
      if (isValidEmail(email)) void sendCode(email, false);
      return;
    }
    if (isCompleteOtpCode(code)) void submitCode();
  }, [status, step, email, code, sendCode, submitCode]);

  /**
   * Vérification automatique dès que le code est complet.
   *
   * ChatGPT, Claude et Slack se comportent tous ainsi (§4.2). Le remplissage
   * automatique d'iOS insère les six chiffres d'un coup : exiger un appui
   * supplémentaire après coup n'ajoute aucune information.
   */
  useEffect(() => {
    if (step !== "code" || status !== "idle") return;
    if (!isCompleteOtpCode(code) || lastAttemptRef.current === code) return;
    void submitCode();
  }, [step, status, code, submitCode]);

  const resend = useCallback(() => {
    if (status !== "idle" || resendIn > 0 || !sentTo) return;
    void sendCode(sentTo, true);
  }, [status, resendIn, sentTo, sendCode]);

  const changeEmail = useCallback(() => {
    setStep("email");
    setCodeInput("");
    setError(null);
    setNotice(null);
    resetCooldown();
    lastAttemptRef.current = null;
  }, [resetCooldown]);

  return {
    step,
    email,
    code,
    sentTo,
    status,
    error,
    notice,
    canSubmit: step === "email" ? isValidEmail(email) : isCompleteOtpCode(code),
    resendIn,
    setEmail,
    setCode,
    submit,
    resend,
    changeEmail,
  };
}
