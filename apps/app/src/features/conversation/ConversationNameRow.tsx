import { useRef, useState } from "react";
import { View } from "react-native";
import type { Conversation } from "@jc/domain";
import { Input } from "@/shared/ui/input";
import { Text } from "@/shared/ui/text";
import { useConversationActions } from "./hooks/use-conversation-actions";

export type ConversationNameRowProps = {
  conversation: Conversation;
  /** Appelé quand la rangée n'a plus lieu d'être — validée ou abandonnée. */
  onDone: () => void;
};

/**
 * Renommage d'une conversation, saisi sur place dans la barre latérale.
 *
 * Même geste que pour un dossier : le nom s'écrit là où il se lit, Entrée
 * valide, Échap abandonne, et cliquer ailleurs valide aussi. Une fenêtre
 * modale demanderait un aller-retour pour trois mots, et ferait perdre de vue
 * la conversation concernée.
 */
export function ConversationNameRow({ conversation, onDone }: ConversationNameRowProps) {
  const { rename } = useConversationActions(conversation.id);
  const [title, setTitle] = useState(conversation.title);
  // Échap démonte la rangée, et le `blur` qui suit ne doit pas enregistrer ce
  // que l'utilisateur vient d'abandonner.
  const abandoned = useRef(false);

  const submit = () => {
    if (abandoned.current || rename.isPending) return;

    const trimmed = title.trim();
    // Un titre vide, ou inchangé, ne vaut pas un aller-retour serveur.
    if (trimmed.length === 0 || trimmed === conversation.title) {
      onDone();
      return;
    }

    rename.mutate(trimmed, { onSuccess: onDone });
  };

  return (
    <View className="gap-1 px-2 py-1">
      <Input
        value={title}
        onChangeText={setTitle}
        placeholder="Titre de la conversation"
        accessibilityLabel="Titre de la conversation"
        autoFocus
        selectTextOnFocus
        returnKeyType="done"
        onSubmitEditing={submit}
        onBlur={submit}
        onKeyPress={(event) => {
          if (event.nativeEvent.key === "Escape") {
            abandoned.current = true;
            onDone();
          }
        }}
        editable={!rename.isPending}
        className="h-8"
      />

      {/* Message fixe, et non `error.message` : une erreur remontée du serveur
          peut porter des fragments de requête, donc des données utilisateur. */}
      {rename.isError ? (
        <Text className="text-xs text-destructive">Enregistrement impossible. Réessayez.</Text>
      ) : null}
    </View>
  );
}
