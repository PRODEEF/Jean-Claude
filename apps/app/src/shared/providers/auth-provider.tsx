import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { isCompleteOtpCode, normalizeEmail, normalizeOtpCode } from "@jc/domain";
import { supabase } from "../lib/supabase";
import { INCOMPLETE_CODE_MESSAGE, toAuthErrorMessage } from "../lib/auth-error";

type AuthContextValue = {
  session: Session | null;
  /** `true` tant que la session persistée n'a pas été relue au démarrage. */
  isLoading: boolean;
  /** Étape 1 : envoi du code à usage unique par e-mail (§6.1). */
  requestCode: (email: string) => Promise<void>;
  /** Étape 2 : vérification du code saisi. */
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,

      /**
       * Code à usage unique par e-mail, et non lien magique (§6.1) : un code
       * se saisit sur l'appareil qui demande la connexion, même si la boîte
       * mail est ouverte ailleurs — cas courant en usage mobile.
       *
       * `shouldCreateUser: true` est ce qui rend l'inscription et la
       * reconnexion indiscernables : il n'y a pas à savoir, ni à demander à
       * l'utilisateur, s'il possède déjà un compte.
       */
      requestCode: async (email: string) => {
        // La normalisation a lieu ici, à la frontière, et non dans l'écran :
        // c'est le seul moyen de garantir que les deux étapes portent sur la
        // même chaîne quel que soit l'appelant.
        const normalized = normalizeEmail(email);
        if (!normalized) throw new Error("Adresse e-mail invalide.");

        const { error } = await supabase.auth.signInWithOtp({
          email: normalized,
          options: { shouldCreateUser: true },
        });
        if (error) throw new Error(toAuthErrorMessage(error));
      },

      verifyCode: async (email: string, code: string) => {
        const normalized = normalizeEmail(email);
        if (!normalized) throw new Error("Adresse e-mail invalide.");

        const token = normalizeOtpCode(code);
        if (!isCompleteOtpCode(token)) throw new Error(INCOMPLETE_CODE_MESSAGE);

        // `type: "email"` couvre les deux cas : première connexion (le compte
        // est créé et confirmé par le code) et reconnexion.
        const { error } = await supabase.auth.verifyOtp({
          email: normalized,
          token,
          type: "email",
        });
        if (error) throw new Error(toAuthErrorMessage(error));
      },

      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>.");
  }
  return context;
}
