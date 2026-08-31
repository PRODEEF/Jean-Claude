import { View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, Settings } from "lucide-react-native";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Separator } from "@/shared/ui/separator";
import { Text } from "@/shared/ui/text";
import { useCurrentUser } from "@/shared/hooks/use-current-user";
import { useAuth } from "@/shared/providers/auth-provider";

/**
 * Profil de l'utilisateur — destination de la pastille de la bannière.
 *
 * Se limite à l'identité et à la fin de session. Les préférences (nom et
 * couleur de l'assistant, thème, périmètre du mode assistant) restent dans
 * Réglages : les mélanger obligerait l'utilisateur à chercher au même endroit
 * deux choses qu'il ne vient jamais faire en même temps.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { email, displayName, initials } = useCurrentUser();

  return (
    <View className="flex-1 bg-background">
      <View className="w-full max-w-2xl gap-6 self-center p-6">
        <View className="flex-row items-center gap-4">
          <Avatar alt={`Avatar de ${displayName}`} className="size-16">
            <AvatarFallback className="bg-secondary">
              <Text className="text-xl font-medium text-foreground">{initials}</Text>
            </AvatarFallback>
          </Avatar>
          <View className="flex-1">
            <Text className="text-2xl font-semibold text-foreground" numberOfLines={1}>
              {displayName}
            </Text>
            <Text className="text-sm text-muted-foreground" numberOfLines={1}>
              {email}
            </Text>
          </View>
        </View>

        <Separator />

        <Button
          variant="ghost"
          onPress={() => router.push("/settings")}
          className="h-auto justify-start gap-3 px-2 py-3"
        >
          <Icon as={Settings} size={18} className="text-muted-foreground" />
          <Text className="flex-1 text-base text-foreground">Réglages</Text>
          <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
        </Button>

        <Separator />

        <Button variant="outline" onPress={() => void signOut()}>
          <Text className="text-destructive">Se déconnecter</Text>
        </Button>
      </View>
    </View>
  );
}
