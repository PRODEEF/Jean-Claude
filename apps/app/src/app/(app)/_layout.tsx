import { useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { Slot } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AppSidebar,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "@/features/navigation/AppSidebar";
import { useAssistantChannel } from "@/features/navigation/use-sidebar-data";
import { AppBanner } from "@/features/navigation/AppBanner";
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
  const { width: windowWidth } = useWindowDimensions();

  // Le canal se crée ici, pas seulement quand la barre est montée : en
  // `compact` le tiroir est démonté tant qu'il est fermé, et sans cet appel
  // la pastille d'accueil restait éteinte à la première connexion.
  useAssistantChannel();

  // `null` = l'utilisateur n'a pas encore tranché : la barre suit alors la
  // taille d'écran, ouverte sur desktop et fermée sur téléphone.
  const [preference, setPreference] = useState<boolean | null>(null);
  const visible = preference ?? expanded;

  // La largeur vit ici et non dans la barre : celle-ci est démontée à chaque
  // repli, et l'ajustement de l'utilisateur serait perdu au passage. 20 % de
  // la fenêtre au chargement, borné aux mêmes limites que la poignée — sans
  // ça, un écran étroit ouvrait la barre sous 200 pt et le geste de resize
  // rentrait en conflit avec l'état initial.
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(windowWidth * 0.2))),
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <AppBanner onToggleSidebar={() => setPreference(!visible)} />

      <View className="flex-1 flex-row">
        {/* Le tiroir ne reçoit pas `onResize` : superposé au contenu et refermé
            à la première navigation, il n'a pas de largeur à négocier. */}
        {expanded && visible ? (
          <AppSidebar width={sidebarWidth} onResize={setSidebarWidth} />
        ) : null}
        <View className="flex-1">
          <Slot />
        </View>
      </View>

      {/* En deçà du point de rupture, la barre passe au-dessus du contenu
          plutôt que de le comprimer : à cette largeur, la partager laisserait
          les deux illisibles. */}
      {!expanded && visible ? (
        <View
          className="absolute inset-0 flex-row"
          style={{ paddingTop: insets.top + 56 }}
          // `box-none` en prop et non mêlé à `style` : sa zone de padding,
          // au-dessus de la barre latérale, n'a aucun enfant mais couvrait
          // déjà la bannière — sans lui, le second appui sur le bouton
          // hamburger (fermeture) y était capté au lieu d'atteindre le
          // bouton, qui ne pouvait donc qu'ouvrir le tiroir, jamais le
          // refermer. Posé ici plutôt que dans `style` (react-native-web ne
          // sait traduire `pointerEvents` en CSS que si tout l'objet `style`
          // est statique — `paddingTop` étant calculé à l'exécution, il
          // basculait l'ensemble en style inline brut, où « box-none » finit
          // écrit tel quel dans l'attribut HTML, une valeur invalide que le
          // navigateur ignore) : sur mobile web, seul un vrai appareil ou
          // React Native natif l'aurait honoré, jamais un navigateur.
          pointerEvents="box-none"
        >
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
