import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Sparkles } from "lucide-react-native";
import { spacing } from "@jc/design";
import { api } from "@/shared/lib/api";
import { Composer } from "@/features/conversation/Composer";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { useCurrentUser } from "@/shared/hooks/use-current-user";

/**
 * Écran d'accueil : aucune conversation ouverte.
 *
 * La liste des conversations a rejoint la barre latérale, visible en permanence
 * sur desktop. La reproduire ici afficherait deux fois la même chose côte à
 * côte ; l'espace sert donc à amorcer l'échange, comme le font ChatGPT, Claude
 * et Perplexity (§4.2).
 *
 * La saisie remplace le bouton « Nouvelle conversation » : le premier message
 * suffit à créer le fil, et faire cliquer avant d'écrire ajoutait un geste sans
 * rien demander de plus (§13.4.1 — capture sans friction).
 */
export default function ChatHomeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { firstName } = useCurrentUser();
  const [draft, setDraft] = useState("");

  // La conversation naît sans qu'on demande où la ranger ; le message part
  // avec elle et s'envoie à l'ouverture du fil, ce qui évite d'inventer un
  // second chemin d'envoi (§13.4.1).
  const create = useMutation({
    mutationFn: (_content: string) => api.conversations.create({ folderIds: [] }),
    onSuccess: async (conversation, content) => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.push({ pathname: "/chat/[id]", params: { id: conversation.id, draft: content } });
    },
  });

  const start = () => {
    const content = draft.trim();
    if (content.length === 0 || create.isPending) return;
    setDraft("");
    create.mutate(content);
  };

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

      {create.error ? (
        <Text className="text-center text-sm text-destructive">
          La conversation n'a pas pu être créée. Réessayez dans un instant.
        </Text>
      ) : null}

      {/* Bornée comme le fil : la même saisie ne doit pas s'étaler sur un écran
          large ici et rester en colonne là-bas. */}
      <View style={styles.composer}>
        <Composer
          value={draft}
          onChangeText={setDraft}
          onSubmit={start}
          placeholder="Écrivez ce que vous avez en tête"
          busy={create.isPending}
          autoFocus
        />
      </View>

      {/* Formulation neutre : la barre latérale est à gauche sur desktop mais
          en tiroir sur téléphone. */}
      <Text className="text-center text-sm text-muted-foreground">
        Ou reprenez une conversation déjà ouverte.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: { width: "100%", maxWidth: 640, marginTop: spacing.sm },
});
