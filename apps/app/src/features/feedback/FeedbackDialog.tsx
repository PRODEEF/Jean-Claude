import { useState } from "react";
import { TextInput, View } from "react-native";
import { FEEDBACK_CONTENT_MAX_LENGTH, type FeedbackCategory } from "@jc/domain";
import { fontSize } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useTheme } from "@/shared/providers/theme-provider";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { Text } from "@/shared/ui/text";
import { useFeedbackContext, useSubmitFeedback } from "./hooks/use-feedback";

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "idea", label: "Idée" },
  { value: "other", label: "Autre" },
];

/** Une piste par catégorie plutôt qu'un champ libre : ça oriente sans ajouter de saisie. */
const CONTENT_PLACEHOLDER: Record<FeedbackCategory, string> = {
  bug: "Que s'est-il passé ? Qu'attendiez-vous à la place ?",
  idea: "Quelle fonctionnalité ou amélioration verriez-vous bien ?",
  other: "Ce que vous avez à nous dire…",
};

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
  const { palette } = useTheme();
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [content, setContent] = useState("");
  // Distinct de `submit.isSuccess` : celui-ci retombe à `false` dès `reset()`,
  // avant que `close()` n'ait fini de démonter la modale.
  const [sent, setSent] = useState(false);

  const trimmed = content.trim();

  const close = () => {
    submit.reset();
    setCategory("bug");
    setContent("");
    setSent(false);
    onClose();
  };

  const handleSubmit = () => {
    if (trimmed.length === 0) return;
    submit.mutate({ category, content: trimmed, ...context }, { onSuccess: () => setSent(true) });
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Donner votre avis"
      description={sent ? "C'est envoyé, merci." : "Un bug, une idée, autre chose : dites-le-nous."}
      actions={
        sent
          ? [{ label: "Fermer", onPress: close }]
          : [{ label: "Envoyer", onPress: handleSubmit, disabled: trimmed.length === 0 || submit.isPending }]
      }
      error={submit.isError ? "Votre avis n'a pas pu être envoyé. Réessayez." : null}
    >
      {sent ? (
        // Sans ce message, la modale se contentait de se fermer : rien à
        // l'écran ne disait que l'envoi avait abouti.
        <Text style={{ color: palette.success }} accessibilityRole="alert">
          Votre avis a bien été transmis.
        </Text>
      ) : (
        <>
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
            placeholder={CONTENT_PLACEHOLDER[category]}
            multiline
            autoFocus
            maxLength={FEEDBACK_CONTENT_MAX_LENGTH}
            accessibilityLabel="Votre avis"
            textAlignVertical="top"
            className="min-h-32 rounded-md border border-border bg-background px-3 py-2 text-foreground"
            style={{ fontFamily: FONT_FAMILY, fontSize: fontSize.md }}
          />
        </>
      )}
    </Modal>
  );
}
