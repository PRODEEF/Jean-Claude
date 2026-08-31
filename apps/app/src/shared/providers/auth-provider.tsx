import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

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
       */
      requestCode: async (email: string) => {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: true },
        });
        if (error) throw new Error(error.message);
      },

      verifyCode: async (email: string, code: string) => {
        const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
        if (error) throw new Error(error.message);
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
