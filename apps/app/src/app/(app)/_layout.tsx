import { useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { Slot } from "expo-router";
import { PanelLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppSidebar, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "@/features/navigation/AppSidebar";
import { useAssistantChannel } from "@/features/navigation/use-sidebar-data";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useGroupMessageFeed } from "@/features/group/hooks/use-group-realtime";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useSyncDeviceTimezone } from "@/shared/hooks/use-profile";
import { SidebarChromeProvider } from "@/shared/providers/sidebar-chrome";

/**
 * Coquille de l'application authentifiée.
 *
 * Navigation par la gauche, contenu à droite. La même barre latérale sert les
 * deux tailles d'écran : fixe au-delà de 768 pt, tiroir escamotable en deçà.
 * C'est ce qui évite d'entretenir deux navigations — un navigateur en fenêtre
 * étroite se comporte alors comme un téléphone, sans qu'on ait à tester la
 * plateforme.
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

  // Posé ici plutôt que dans un écran : le fuseau sert à dater côté serveur,
  // bien avant qu'on ouvre les réglages ou le calendrier.
  useSyncDeviceTimezone();

  // Ici et non dans la barre latérale : sur téléphone, le tiroir fermé est
  // démonté, et les non-lus des groupes cesseraient d'avancer.
  useGroupMessageFeed();

  const docked = expanded;

  // `null` = l'utilisateur n'a pas encore tranché : la barre suit alors la
  // taille d'écran, ouverte sur desktop et fermée sur téléphone.
  const [preference, setPreference] = useState<boolean | null>(null);
  const visible = preference ?? docked;

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
      <View className="flex-1 flex-row">
        {/* Le tiroir ne reçoit pas `onResize` : superposé au contenu et refermé
            à la première navigation, il n'a pas de largeur à négocier. */}
        {docked && visible ? (
          <AppSidebar
            width={sidebarWidth}
            onResize={setSidebarWidth}
            onCollapse={() => setPreference(false)}
          />
        ) : null}
        <SidebarChromeProvider collapsed={!visible}>
          <View className="min-h-0 flex-1">
            <Slot />
            {/* Même coin que dans la barre ouverte (`p-3`). Le titre du
                bandeau commence à droite de ce bouton, pas en dessous. */}
            {!visible ? (
              <View className="absolute left-3 top-3 z-10">
                <Button
                  variant="ghost"
                  size="icon"
                  onPress={() => setPreference(true)}
                  accessibilityLabel="Afficher la navigation"
                  className="bg-background"
                >
                  <Icon as={PanelLeft} size={18} className="text-muted-foreground" />
                </Button>
              </View>
            ) : null}
          </View>
        </SidebarChromeProvider>
      </View>

      {/* En deçà du point de rupture, la barre passe au-dessus du contenu
          plutôt que de le comprimer : à cette largeur, la partager laisserait
          les deux illisibles. */}
      {!docked && visible ? (
        <View
          className="absolute inset-0 flex-row"
          style={{ paddingTop: insets.top }}
          // `box-none` en prop et non mêlé à `style` : react-native-web ne sait
          // traduire `pointerEvents` en CSS que si tout l'objet `style` est
          // statique — `paddingTop` étant calculé à l'exécution, il basculait
          // l'ensemble en style inline brut, où « box-none » finit écrit tel
          // quel dans l'attribut HTML, une valeur invalide que le navigateur
          // ignore.
          pointerEvents="box-none"
        >
          <AppSidebar
            onNavigate={() => setPreference(false)}
            onCollapse={() => setPreference(false)}
          />
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
