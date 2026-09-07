import { useState } from "react";
import { Pressable, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { PanelLeft, Search } from "lucide-react-native";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useCurrentUser } from "@/shared/hooks/use-current-user";
import { useAssistantName, useProfile } from "@/shared/hooks/use-profile";
import { cn } from "@/shared/lib/utils";
import { SearchDialog } from "@/features/search/SearchDialog";
import { UTILITY_LINKS } from "./utility-links";

export type AppBannerProps = {
  /** Affiché uniquement quand la barre latérale est escamotable. */
  onToggleSidebar?: () => void;
};

/**
 * Bannière fixe de l'application.
 *
 * Trois zones de largeur égale : le titre reste optiquement centré quelle que
 * soit la longueur du nom de l'utilisateur à droite. Un simple
 * `justify-between` le décalerait dès que ce nom change.
 */
export function AppBanner({ onToggleSidebar }: AppBannerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const breakpoint = useBreakpoint();
  const { displayName, initials } = useCurrentUser();
  const assistantName = useAssistantName();
  const { data: profile } = useProfile();
  const [searching, setSearching] = useState(false);

  // Option « bandeau uni » (demande produit) : le fond pastel dérivé de la
  // couleur d'assistant cède la place à son aplat plein — « uni » comme
  // « sans dégradé de teinte », pas comme « neutre ». Le reste des usages de
  // `accent-soft` (bulles, cartes de question, calendrier) n'est pas concerné.
  const flat = profile?.preferences.flatBanner ?? true;
  const fg = flat ? "text-primary-foreground" : "text-accent-soft-foreground";

  return (
    <View
      className={cn(
        "h-14 flex-row items-center gap-2 border-b border-border px-3",
        flat ? "bg-primary" : "bg-accent-soft",
      )}
    >
      {/* `min-w-0` est indispensable : sans lui, une zone en `flex-1` refuse de
          passer sous la largeur de son contenu, et les trois zones se
          chevauchent dès que la fenêtre se resserre. */}
      <View className="min-w-0 flex-1 flex-row items-center">
        {onToggleSidebar ? (
          <Button
            variant="ghost"
            size="icon"
            onPress={onToggleSidebar}
            accessibilityLabel="Afficher ou masquer les conversations"
          >
            <Icon as={PanelLeft} size={18} className={fg} />
          </Button>
        ) : null}

        {/* Contre le bouton de la barre latérale, comme dans ChatGPT et
            Claude : chercher une conversation et parcourir la liste des
            conversations sont le même geste, à deux moyens près. */}
        <Button
          variant="ghost"
          size="icon"
          onPress={() => setSearching(true)}
          accessibilityLabel="Rechercher une conversation"
        >
          <Icon as={Search} size={18} className={fg} />
        </Button>
      </View>

      {/* Le titre ramène à l'accueil des conversations, comme le ferait un
          logo — le canal permanent, lui, reste à un geste dans la barre
          latérale, pastille de non-lu à l'appui (A.10). */}
      <Pressable
        onPress={() => router.push("/chat")}
        accessibilityRole="button"
        accessibilityLabel="Revenir à l'accueil des conversations"
        // La ligne de titre ne fait qu'une vingtaine de points de haut : le
        // débord lui rend la cible tactile de 44 pt sans épaissir la bannière.
        hitSlop={12}
        // `flex-1` et non `shrink` seul : avec `flex-basis: auto`, l'élément
        // se dimensionne d'abord sur son contenu (le texte entier), et
        // `max-width: 100%` sur le texte n'a alors plus rien à limiter. Il
        // faut `flex-basis: 0` — comme sur les deux zones latérales — pour
        // que l'espace disponible soit réparti avant que le texte ne s'y
        // borne et tronque.
        className="min-w-0 flex-1"
      >
        <Text className={cn("text-center text-sm", fg)} numberOfLines={1}>
          <Text className={cn("text-sm font-bold uppercase", fg)}>{assistantName}</Text>
          , ton assistant perso
        </Text>
      </Pressable>

      <View className="min-w-0 flex-1 flex-row items-center justify-end">
        {UTILITY_LINKS.map((link) => {
          // `default` et non `ghost` : son fond plein (couleur d'accent) reste
          // visible une fois le geste terminé, contrairement au survol — sans
          // quoi rien ne distingue plus l'onglet ouvert dès que le curseur
          // s'en écarte.
          const active = pathname === link.href;

          return (
            <Button
              key={link.href}
              variant={active ? "default" : "ghost"}
              size="icon"
              onPress={() => router.push(link.href)}
              accessibilityLabel={link.label}
              accessibilityState={{ selected: active }}
              // Sur bandeau uni, le fond du bouton actif (`bg-primary`) est
              // désormais celui du bandeau lui-même : sans cet anneau, l'onglet
              // ouvert deviendrait indiscernable du reste de la barre.
              className={cn(flat && active && "ring-2 ring-primary-foreground/60")}
            >
              <Icon as={link.icon} size={18} className={active ? "text-primary-foreground" : fg} />
            </Button>
          );
        })}

        <Button
          variant="ghost"
          onPress={() => router.push("/settings")}
          accessibilityLabel={`Ouvrir les réglages de ${displayName}`}
          className="h-auto max-w-full gap-2 rounded-full py-1 pl-1 pr-1 sm:pr-3"
        >
          <Avatar alt={`Avatar de ${displayName}`} className="size-7">
            <AvatarFallback className="bg-background">
              <Text className="text-xs font-medium text-foreground">{initials}</Text>
            </AvatarFallback>
          </Avatar>
          {/* Sous 768 pt, la pastille seule suffit : le nom écrasé contre le
              titre le rendrait illisible sans rien apprendre à l'utilisateur,
              qui sait qui il est. */}
          {breakpoint === "expanded" ? (
            <Text className={cn("shrink text-sm", fg)} numberOfLines={1}>
              {displayName}
            </Text>
          ) : null}
        </Button>
      </View>

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
