import { View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Plus, Sparkles } from "lucide-react-native";
import { api } from "@/shared/lib/api";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { useCurrentUser } from "@/shared/hooks/use-current-user";

/**
 * Écran d'accueil : aucune conversation ouverte.
 *
 * La liste des conversations a rejoint la barre latérale, qui est visible en
 * permanence sur desktop. La reproduire ici afficherait deux fois la même
 * chose côte à côte ; l'espace sert donc à amorcer l'échange, comme le font
 * ChatGPT, Claude et Perplexity (§4.2).
 */
export default function ChatHomeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { firstName } = useCurrentUser();

  const create = useMutation({
    mutationFn: () => api.conversations.create({ folderIds: [] }),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.push(`/chat/${conversation.id}`);
    },
  });

  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
      <View className="size-10 items-center justify-center rounded-lg bg-primary">
        <Icon as={Sparkles} size={20} className="text-primary-foreground" />
      </View>

      <Text className="text-center text-xl font-medium text-foreground">
        {firstName
          ? `Bonjour ${firstName}, qu'est-ce qu'on fait aujourd'hui ?`
          : "Qu'est-ce qu'on fait aujourd'hui ?"}
      </Text>
      {/* Formulation neutre : la barre latérale est à gauche sur desktop mais
          en tiroir sur téléphone. */}
      <Text className="text-center text-sm text-muted-foreground">
        Choisissez une conversation, ou démarrez-en une nouvelle.
      </Text>

      {create.error ? (
        <Text className="text-center text-sm text-destructive">
          La conversation n'a pas pu être créée. Réessayez dans un instant.
        </Text>
      ) : null}

      <Button
        onPress={() => create.mutate()}
        disabled={create.isPending}
        accessibilityLabel="Démarrer une nouvelle conversation"
        className="mt-2 gap-2"
      >
        <Icon as={Plus} size={16} className="text-primary-foreground" />
        <Text>Nouvelle conversation</Text>
      </Button>
    </View>
  );
}
