import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import { MEMORY_MAX_LENGTH, type Memory } from "@jc/domain";
import { ApiError } from "@jc/api-client";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Text } from "@/shared/ui/text";
import { useMemories, useMemoryActions } from "./use-memories";

/**
 * « Ce que Jean-Claude sait de moi » : ce qu'il retient, que l'utilisateur relit,
 * corrige, supprime ou complète (demande de Yann, 25 novembre).
 *
 * Jean-Claude ne retient rien sans l'accord de l'utilisateur : chaque chose est
 * née d'une proposition acceptée dans une conversation, ou saisie ici. C'est la
 * contrepartie de cette mémoire — elle n'a de valeur que si on voit ce qu'elle
 * contient et qu'on peut la défaire.
 */
export function MemoryDialog({ onClose }: { onClose: () => void }) {
  const { data, isPending, isError } = useMemories();
  const { add, update, remove } = useMemoryActions();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const content = draft.trim();
    if (content.length === 0) return;
    setError(null);
    add.mutate(content, {
      onSuccess: () => setDraft(""),
      onError: (cause) => setError(toMessage(cause)),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Ce que Jean-Claude sait de moi"
      description="Jean-Claude ne retient rien sans votre accord. Vous pouvez tout corriger ou supprimer."
      error={error}
      actions={[{ label: "Fermer", onPress: onClose }]}
    >
      {isPending ? <Text className="text-muted-foreground text-sm">Chargement…</Text> : null}
      {isError ? (
        <Text className="text-destructive text-sm">
          Impossible d'afficher la liste pour le moment. Réessayez dans un instant.
        </Text>
      ) : null}
      {data && data.length === 0 ? (
        <Text className="text-muted-foreground text-sm">
          Rien pour l'instant. Quand vous lui parlerez de vos habitudes ou de vos goûts, Jean-Claude
          vous proposera de les retenir. Vous pouvez aussi les ajouter vous-même ci-dessous.
        </Text>
      ) : null}

      <View className="gap-1">
        {(data ?? []).map((memory) => (
          <MemoryRow
            key={memory.id}
            memory={memory}
            onSave={(content, done) =>
              update.mutate(
                { id: memory.id, content },
                { onSuccess: done, onError: (cause) => setError(toMessage(cause)) },
              )
            }
            onDelete={() =>
              remove.mutate(memory.id, { onError: (cause) => setError(toMessage(cause)) })
            }
          />
        ))}
      </View>

      <View className="gap-1">
        <Text className="text-muted-foreground text-xs">Ajouter quelque chose</Text>
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Input
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={submit}
              placeholder="Ex. : Je préfère courir le matin"
              maxLength={MEMORY_MAX_LENGTH}
              accessibilityLabel="Ce que Jean-Claude doit retenir"
            />
          </View>
          <Button
            onPress={submit}
            disabled={add.isPending || draft.trim().length === 0}
            accessibilityRole="button"
          >
            <Text>Ajouter</Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}

/** Une chose retenue : un appui dessus la rend modifiable, la corbeille la supprime. */
function MemoryRow({
  memory,
  onSave,
  onDelete,
}: {
  memory: Memory;
  onSave: (content: string, done: () => void) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);
  // Entrée ferme le champ, dont la sortie (`onBlur`) ne doit pas enregistrer une seconde fois.
  const finished = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    const content = draft.trim();
    if (content.length === 0 || content === memory.content) {
      setDraft(memory.content);
      setEditing(false);
      return;
    }
    onSave(content, () => setEditing(false));
  };

  return (
    <View className="border-border min-h-11 flex-row items-center gap-2 border-b py-1">
      <View className="flex-1">
        {editing ? (
          <Input
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={finish}
            onBlur={finish}
            autoFocus
            maxLength={MEMORY_MAX_LENGTH}
            accessibilityLabel="Modifier ce que Jean-Claude retient"
          />
        ) : (
          <Pressable
            onPress={() => {
              setDraft(memory.content);
              finished.current = false;
              setEditing(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Modifier : ${memory.content}`}
            className="py-2"
          >
            <Text className="text-sm">{memory.content}</Text>
          </Pressable>
        )}
      </View>
      <Button
        variant="ghost"
        size="icon"
        onPress={onDelete}
        hitSlop={8}
        accessibilityLabel={`Supprimer : ${memory.content}`}
      >
        <Icon as={Trash2} size={16} className="text-muted-foreground" />
      </Button>
    </View>
  );
}

/** Un 4xx vient de nos règles et porte un message pour l'utilisateur ; le reste est générique. */
function toMessage(cause: Error): string {
  if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) return cause.message;
  return "L'enregistrement a échoué. Réessayez dans un instant.";
}
