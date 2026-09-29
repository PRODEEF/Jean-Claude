import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { Text } from "@/shared/ui/text";
import { useSetGroupMuted } from "./hooks/use-groups";

export type GroupAssistantDialogProps = {
  /** `null` = fenêtre fermée. */
  group: { id: string; aiMuted: boolean } | null;
  assistantName: string;
  onClose: () => void;
};

/**
 * Quand Jean-Claude prend la parole dans la conversation.
 *
 * Deux choix décrits plutôt qu'une bascule à libellé court : « actif » ne dit
 * pas ce que l'IA fait, ni qu'elle peut parler sans qu'on l'appelle. Le
 * réglage vaut pour tous les membres.
 */
export function GroupAssistantDialog({ group, assistantName, onClose }: GroupAssistantDialogProps) {
  if (!group) return null;

  return (
    <AssistantForm
      key={group.id}
      groupId={group.id}
      current={group.aiMuted}
      assistantName={assistantName}
      onClose={onClose}
    />
  );
}

function AssistantForm({
  groupId,
  current,
  assistantName,
  onClose,
}: {
  groupId: string;
  current: boolean;
  assistantName: string;
  onClose: () => void;
}) {
  const setMuted = useSetGroupMuted(groupId);
  const [muted, setMutedChoice] = useState(current);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Quand ${assistantName} intervient`}
      description="Ce réglage vaut pour tous les membres de la conversation."
      error={
        setMuted.isError
          ? "Le réglage n'a pas pu être enregistré. Réessayez dans un instant."
          : null
      }
      actions={[
        { label: "Annuler", onPress: onClose, disabled: setMuted.isPending },
        {
          label: "Enregistrer",
          variant: "default",
          disabled: setMuted.isPending,
          onPress: () => {
            // Rien à écrire, ni à annoncer au groupe, si le choix n'a pas changé.
            if (muted === current) return onClose();
            setMuted.mutate(muted, { onSuccess: onClose });
          },
        },
      ]}
    >
      <View className="gap-2">
        <Choice
          selected={!muted}
          onPress={() => setMutedChoice(false)}
          title="Il intervient de lui-même"
          detail="Il répond quand on l'appelle avec @Jean-Claude, et prend la parole seul pour répondre à une question restée sans réponse, corriger une information inexacte, récapituler une décision ou synthétiser une discussion qui tourne en rond."
        />
        <Choice
          selected={muted}
          onPress={() => setMutedChoice(true)}
          title="Seulement si on l'appelle"
          detail="Il ne répond que lorsqu'on le mentionne avec @Jean-Claude."
        />
      </View>
    </Modal>
  );
}

function Choice({
  selected,
  onPress,
  title,
  detail,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  detail: string;
}) {
  return (
    <Button
      variant="ghost"
      onPress={onPress}
      role="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={title}
      className={
        selected
          ? "h-auto items-start justify-start gap-3 rounded-md border border-primary px-3 py-3"
          : "h-auto items-start justify-start gap-3 rounded-md border border-border px-3 py-3"
      }
    >
      <View
        className={
          selected
            ? "mt-0.5 size-5 items-center justify-center rounded-full border border-primary"
            : "mt-0.5 size-5 items-center justify-center rounded-full border border-border"
        }
      >
        {selected ? <View className="size-2.5 rounded-full bg-primary" /> : null}
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-sm font-medium text-foreground">{title}</Text>
        <Text className="text-xs font-normal text-muted-foreground">{detail}</Text>
      </View>
    </Button>
  );
}
