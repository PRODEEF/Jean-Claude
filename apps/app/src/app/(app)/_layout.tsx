import { useState } from "react";
import { Pressable, View } from "react-native";
import { Slot } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppBanner } from "@/features/navigation/AppBanner";
import { AppSidebar } from "@/features/navigation/AppSidebar";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";

/**
 * Coquille de l'application authentifiée.
 *
 * Bannière fixe en haut, navigation par la gauche, contenu à droite. La même
 * barre latérale sert les deux tailles d'écran : fixe au-delà de 768 pt,
 * tiroir escamotable en deçà. C'est ce qui évite d'entretenir deux
 * navigations — un navigateur en fenêtre étroite se comporte alors comme un
 * téléphone, sans qu'on ait à tester la plateforme.
 */
export default function AppLayout() {
  const breakpoint = useBreakpoint();
  const insets = useSafeAreaInsets();
  const expanded = breakpoint === "expanded";

  // `null` = l'utilisateur n'a pas encore tranché : la barre suit alors la
  // taille d'écran, ouverte sur desktop et fermée sur téléphone.
  const [preference, setPreference] = useState<boolean | null>(null);
  const visible = preference ?? expanded;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <AppBanner onToggleSidebar={() => setPreference(!visible)} />

      <View className="flex-1 flex-row">
        {expanded && visible ? <AppSidebar /> : null}
        <View className="flex-1">
          <Slot />
        </View>
      </View>

      {/* En deçà du point de rupture, la barre passe au-dessus du contenu
          plutôt que de le comprimer : à cette largeur, la partager laisserait
          les deux illisibles. */}
      {!expanded && visible ? (
        <View className="absolute inset-0 flex-row" style={{ paddingTop: insets.top + 56 }}>
          <AppSidebar onNavigate={() => setPreference(false)} />
          {/* Noir littéral et non un jeton de la palette : le modificateur
              d'opacité de Tailwind ne sait pas calculer d'alpha sur une
              variable CSS, et un voile clair en thème sombre n'assombrirait
              rien. C'est aussi ce qu'utilise le Sheet de shadcn. */}
          <Pressable
            className="flex-1 bg-black/50"
            onPress={() => setPreference(false)}
            accessibilityRole="button"
            accessibilityLabel="Fermer la navigation"
          />
        </View>
      ) : null}
    </View>
  );
}
