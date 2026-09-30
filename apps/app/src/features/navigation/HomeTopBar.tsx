import { useState } from "react";
import { View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { House, MessageCircle, PanelLeft, Search, type LucideIcon } from "lucide-react-native";
import { FeedbackDialog } from "@/features/feedback/FeedbackDialog";
import { SearchDialog } from "@/features/search/SearchDialog";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { ContextMenu } from "@/shared/ui/context-menu";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useCurrentUser } from "@/shared/hooks/use-current-user";
import { useAssistantName, useProfile } from "@/shared/hooks/use-profile";
import { cn } from "@/shared/lib/utils";
import { useAuth } from "@/shared/providers/auth-provider";
import { UnreadBadge } from "./SidebarSection";
import { useAssistantChannel } from "./use-sidebar-data";
import { setSidebarLayout, SIDEBAR_LAYOUTS } from "./use-sidebar-layout";
import { UTILITY_LINKS } from "./utility-links";

export type HomeTopBarProps = {
  /** Ouvre l'arborescence des dossiers et conversations, en tiroir. */
  onOpenNavigation: () => void;
};

type Tab = { href: string; label: string; icon: LucideIcon; badge?: boolean };

/**
 * Barre d'onglets de la variante « Accueil » (§4.3).
 *
 * Les destinations tiennent sur une ligne, en haut, comme les onglets de
 * Todoist, TickTick et Google Agenda sur le web : quatre vues, pas un
 * arbre. L'arborescence, elle, n'est plus affichée en permanence — elle
 * s'ouvre en tiroir depuis le bouton de gauche, là où Apple Notes et Notion
 * rangent leur liste de dossiers une fois repliée (§4.2).
 */
export function HomeTopBar({ onOpenNavigation }: HomeTopBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const expanded = useBreakpoint() === "expanded";
  const { displayName, initials } = useCurrentUser();
  const { signOut } = useAuth();
  const assistantName = useAssistantName();
  const isAdmin = useProfile().data?.isAdmin === true;
  const channel = useAssistantChannel().data;
  const [searching, setSearching] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const tabs: Tab[] = [
    { href: "/chat", label: "Accueil", icon: House },
    { href: "/assistant", label: assistantName, icon: MessageCircle, badge: true },
    ...UTILITY_LINKS.map((link) => ({ href: link.href, label: link.label, icon: link.icon })),
  ];

  const menuItems = [
    { label: "Réglages", onPress: () => router.push("/settings") },
    // Signalement direct, distinct des suggestions du modèle (§12.1).
    { label: "Signaler un problème", onPress: () => setFeedbackOpen(true) },
    ...(isAdmin
      ? [{ label: "Retours des testeurs", onPress: () => router.push("/feedback") }]
      : []),
    ...SIDEBAR_LAYOUTS.filter((item) => item.value !== "home").map((item) => ({
      label: `Navigation ${item.label.toLowerCase()}`,
      onPress: () => setSidebarLayout(item.value),
    })),
    { label: "Se déconnecter", onPress: () => void signOut() },
  ];

  return (
    <View className="h-14 flex-row items-center gap-2 border-b border-border bg-background px-3">
      <View className={cn("min-w-0 flex-row items-center gap-1", expanded && "flex-1")}>
        <Button
          variant="ghost"
          onPress={onOpenNavigation}
          accessibilityLabel="Afficher les dossiers et les conversations"
          className="gap-2 px-2"
        >
          <Icon as={PanelLeft} size={18} className="text-muted-foreground" />
          {expanded ? <Text className="text-sm font-normal text-foreground">Dossiers</Text> : null}
        </Button>
      </View>

      {/* Onglets centrés, en pilule : la vue ouverte se lit d'un coup d'œil sans
          qu'aucun titre d'écran ait à la répéter. Icônes seules sous 768 pt. */}
      <View className="min-w-0 flex-1 items-center">
        <View className="flex-row gap-1 rounded-full bg-muted p-1">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            const unread =
              tab.badge && !active ? (
                <UnreadBadge
                  count={channel?.unreadCount ?? 0}
                  pendingQuestion={channel?.hasPendingQuestion ?? false}
                />
              ) : null;

            return (
              <Button
                key={tab.href}
                variant="ghost"
                size="sm"
                onPress={() => router.push(tab.href as never)}
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: active }}
                className={cn("gap-2 rounded-full px-3", active && "bg-background shadow-sm")}
              >
                <Icon
                  as={tab.icon}
                  size={16}
                  className={active ? "text-foreground" : "text-muted-foreground"}
                />
                {expanded ? (
                  <Text
                    className={cn(
                      "text-sm",
                      active ? "font-medium text-foreground" : "font-normal text-muted-foreground",
                    )}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                ) : null}
                {unread}
              </Button>
            );
          })}
        </View>
      </View>

      <View className={cn("min-w-0 flex-row items-center justify-end gap-1", expanded && "flex-1")}>
        <Button
          variant="ghost"
          size="icon"
          onPress={() => setSearching(true)}
          accessibilityLabel="Rechercher une conversation"
        >
          <Icon as={Search} size={18} className="text-muted-foreground" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onPress={(event) => setMenu({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })}
          accessibilityLabel={`Menu du compte de ${displayName}`}
          className="rounded-full"
        >
          <Avatar alt={`Avatar de ${displayName}`} className="size-8">
            <AvatarFallback className="bg-primary">
              <Text className="text-xs font-semibold text-primary-foreground">{initials}</Text>
            </AvatarFallback>
          </Avatar>
        </Button>
      </View>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={menuItems.map((item) => ({
            ...item,
            onPress: () => {
              setMenu(null);
              item.onPress();
            },
          }))}
        />
      ) : null}
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <SearchDialog
        open={searching}
        onClose={() => setSearching(false)}
        onSelect={(conversation) => {
          setSearching(false);
          router.push({ pathname: "/chat/[id]", params: { id: conversation.id } });
        }}
      />
    </View>
  );
}
