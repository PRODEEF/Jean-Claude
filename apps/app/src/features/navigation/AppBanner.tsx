import { View } from "react-native";
import { useRouter } from "expo-router";
import { PanelLeft } from "lucide-react-native";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useCurrentUser } from "@/shared/hooks/use-current-user";

/**
 * Nom de l'assistant.
 *
 * Constante tant que le réglage « Prénom de l'assistant » (Phase B) n'existe
 * pas. Le jour où il existera, c'est la seule ligne à remplacer par la
 * préférence utilisateur — la bannière la lit déjà comme une donnée.
 */
const ASSISTANT_NAME = "Jean-Claude";

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
  const breakpoint = useBreakpoint();
  const { displayName, initials } = useCurrentUser();

  return (
    <View className="h-14 flex-row items-center gap-2 border-b border-border bg-primary px-3">
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
            <Icon as={PanelLeft} size={18} className="text-primary-foreground" />
          </Button>
        ) : null}
      </View>

      <Text className="shrink text-center text-sm text-primary-foreground" numberOfLines={1}>
        <Text className="text-sm font-bold uppercase text-primary-foreground">
          {ASSISTANT_NAME}
        </Text>
        , ton assistant perso
      </Text>

      <View className="min-w-0 flex-1 flex-row items-center justify-end">
        <Button
          variant="ghost"
          onPress={() => router.push("/profile")}
          accessibilityLabel={`Ouvrir le profil de ${displayName}`}
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
            <Text className="shrink text-sm text-primary-foreground" numberOfLines={1}>
              {displayName}
            </Text>
          ) : null}
        </Button>
      </View>
    </View>
  );
}
