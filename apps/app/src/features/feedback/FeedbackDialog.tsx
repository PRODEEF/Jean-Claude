import { useState } from "react";
import { TextInput, View } from "react-native";
import { FEEDBACK_CONTENT_MAX_LENGTH, type FeedbackCategory } from "@jc/domain";
import { fontSize } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { Text } from "@/shared/ui/text";
import { useFeedbackContext, useSubmitFeedback } from "./hooks/use-feedback";

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "idea", label: "Idée" },
  { value: "other", label: "Autre" },
];

export type FeedbackDialogProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Avis général sur l'app — bug, idée, autre chose. Point d'entrée unique,
 * ouvert depuis le canal Jean-Claude et depuis les Réglages. N'a rien à voir
 * avec `assistant_suggestions` : c'est un geste utilisateur direct, jamais
 * une proposition du modèle (§12.1, A.10).
 */
export function FeedbackDialog({ open, onClose }: FeedbackDialogProps) {
  const context = useFeedbackContext();
  const submit = useSubmitFeedback();
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [content, setContent] = useState("");

  const trimmed = content.trim();

  const close = () => {
    submit.reset();
    setCategory("bug");
    setContent("");
    onClose();
  };

  const handleSubmit = () => {
    if (trimmed.length === 0) return;
    submit.mutate({ category, content: trimmed, ...context }, { onSuccess: close });
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Donner votre avis"
      description="Un bug, une idée, autre chose : dites-le-nous."
      actions={[
        {
          label: "Envoyer",
          onPress: handleSubmit,
          disabled: trimmed.length === 0 || submit.isPending,
        },
      ]}
      error={submit.isError ? "Votre avis n'a pas pu être envoyé. Réessayez." : null}
    >
      <View className="gap-2" accessibilityRole="radiogroup">
        <Text className="text-sm text-muted-foreground">Catégorie</Text>
        <View className="flex-row gap-1 rounded-md border border-border p-1">
          {CATEGORIES.map((option) => (
            <Button
              key={option.value}
              variant={option.value === category ? "default" : "ghost"}
              onPress={() => setCategory(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: option.value === category }}
              accessibilityLabel={option.label}
              className="h-11 flex-1 sm:h-11"
            >
              <Text>{option.label}</Text>
            </Button>
          ))}
        </View>
      </View>

      <TextInput
        value={content}
        onChangeText={setContent}
        placeholder="Ce que vous avez à nous dire…"
        multiline
        maxLength={FEEDBACK_CONTENT_MAX_LENGTH}
        accessibilityLabel="Votre avis"
        textAlignVertical="top"
        className="min-h-32 rounded-md border border-border bg-background px-3 py-2 text-foreground"
        style={{ fontFamily: FONT_FAMILY, fontSize: fontSize.md }}
      />
    </Modal>
  );
}
