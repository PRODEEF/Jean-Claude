import { useRouter } from "expo-router";
import { PRIVACY_POLICY_MARKDOWN } from "./privacy-policy.content";
import { Markdown } from "@/shared/ui/Markdown";
import { ScreenShell } from "@/shared/ui/screen-shell";

/**
 * Politique de confidentialité (issue #21, §7).
 *
 * Route publique — accessible sans compte, exemptée de la redirection
 * d'authentification dans `app/_layout.tsx` : les stores exigent une page
 * consultable avant même de créer un compte, et un reviewer Apple/Google ne
 * s'authentifie pas pour l'atteindre.
 */
export function PrivacyScreen() {
  const router = useRouter();

  return (
    <ScreenShell title="Politique de confidentialité" onBack={router.canGoBack() ? router.back : undefined}>
      <Markdown>{PRIVACY_POLICY_MARKDOWN}</Markdown>
    </ScreenShell>
  );
}
