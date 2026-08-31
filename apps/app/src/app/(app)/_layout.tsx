import { Tabs } from "expo-router";
import { Platform, Text } from "react-native";
import { fontSize } from "@jc/design";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useTheme } from "@/shared/providers/theme-provider";

/**
 * Navigation principale.
 *
 * Onglets en bas sur téléphone (pattern des apps de référence du §4.2), rail
 * latéral dès 768 pt de large — c'est-à-dire sur tablette, sur le web au format
 * fenêtre et sur desktop. Le même arbre de routes sert les deux : seule la
 * position de la barre change, ce qui évite d'entretenir deux navigations.
 *
 * Les libellés textuels tiennent lieu d'icônes tant qu'aucune police d'icônes
 * n'a été arbitrée. À remplacer une fois le jeu d'icônes choisi.
 */
export default function AppLayout() {
  const { palette } = useTheme();
  const breakpoint = useBreakpoint();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
        },
        tabBarLabelStyle: { fontSize: fontSize.xs },
        // `web` bascule la barre sur le côté au-delà du point de rupture.
        ...(breakpoint === "expanded" && Platform.OS === "web"
          ? { tabBarPosition: "left" as const }
          : {}),
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: "Conversations",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: fontSize.lg }}>💬</Text>,
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: "Jean-Claude",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: fontSize.lg }}>✨</Text>,
        }}
      />
      <Tabs.Screen
        name="todo"
        options={{
          title: "Todoliste",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: fontSize.lg }}>✓</Text>,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendrier",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: fontSize.lg }}>📅</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Réglages",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: fontSize.lg }}>⚙️</Text>,
        }}
      />
    </Tabs>
  );
}
