import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Check, Trash2 } from "lucide-react-native";
import type { Conversation, Folder, FolderTreeNode } from "@jc/domain";
import { api } from "@/shared/lib/api";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Separator } from "@/shared/ui/separator";
import { Text } from "@/shared/ui/text";
import { useConversationActions } from "./hooks/use-conversation-actions";

export type ConversationDialogProps = {
  /** `null` = fenêtre fermée. */
  conversation: Conversation | null;
  onClose: () => void;
  /** Appelé après suppression — l'écran ouvert n'a plus de conversation à afficher. */
  onDeleted: () => void;
};

/**
 * Fenêtre d'une conversation : son nom, son rangement, sa suppression.
 *
 * Le rangement se fait par cases à cocher **multiples** et non par choix
 * unique : une conversation sur la mutuelle relève à la fois de « Santé » et
 * d'« Administratif > Assurances », et c'est la même donnée vue depuis les
 * deux endroits, pas une copie (§5.2, A.1).
 */
export function ConversationDialog({ conversation, onClose, onDeleted }: ConversationDialogProps) {
  return (
    <Dialog
      open={conversation !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {conversation ? (
          <ConversationForm
            key={conversation.id}
            conversation={conversation}
            onClose={onClose}
            onDeleted={onDeleted}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ConversationForm({
  conversation,
  onClose,
  onDeleted,
}: {
  conversation: Conversation;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { save, remove } = useConversationActions(conversation.id);
  const [title, setTitle] = useState(conversation.title);
  const [selected, setSelected] = useState<string[]>(conversation.folderIds);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Même clé que la barre latérale : l'arborescence est déjà en cache, la
  // fenêtre s'ouvre sans attente.
  const folders = useQuery({ queryKey: ["folders"], queryFn: () => api.folders.tree() });
  const roots = (folders.data ?? []).filter((node) => node.parentId === null);

  const pending = save.isPending || remove.isPending;
  const trimmed = title.trim();

  const toggle = (folderId: string) =>
    setSelected((current) =>
      current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId],
    );

  const submit = () => {
    if (trimmed.length === 0 || pending) return;
    save.mutate({ title: trimmed, folderIds: selected }, { onSuccess: onClose });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Conversation</DialogTitle>
      </DialogHeader>

      <Input
        value={title}
        onChangeText={setTitle}
        placeholder="Titre de la conversation"
        accessibilityLabel="Titre de la conversation"
        returnKeyType="done"
        onSubmitEditing={submit}
        editable={!pending}
      />

      <View className="gap-1">
        <Text className="text-xs font-medium text-muted-foreground">Ranger dans des dossiers</Text>

        {roots.length === 0 ? (
          <Text className="py-1 text-xs italic text-muted-foreground">
            Aucun dossier pour le moment. Créez-en un depuis la liste des dossiers.
          </Text>
        ) : (
          <ScrollView className="max-h-52">
            <FolderChecklist
              nodes={roots}
              selected={selected}
              onToggle={toggle}
              disabled={pending}
            />
          </ScrollView>
        )}
      </View>

      {/* Message fixe, et non `error.message` : une erreur remontée du serveur
          peut porter des fragments de requête, donc des données utilisateur. */}
      {save.isError || remove.isError ? (
        <Text className="text-sm text-destructive">
          L'opération a échoué. Réessayez dans un instant.
        </Text>
      ) : null}

      <DialogFooter>
        <Button variant="outline" onPress={onClose} disabled={pending}>
          <Text>Annuler</Text>
        </Button>
        <Button onPress={submit} disabled={trimmed.length === 0 || pending}>
          <Text>Enregistrer</Text>
        </Button>
      </DialogFooter>

      <Separator />

      {confirmingDelete ? (
        <View className="gap-2">
          <Text className="text-sm text-muted-foreground">
            Supprimer « {conversation.title} » ? Les messages seront perdus.
          </Text>
          <View className="flex-row justify-end gap-2">
            <Button variant="outline" onPress={() => setConfirmingDelete(false)} disabled={pending}>
              <Text>Annuler</Text>
            </Button>
            <Button
              variant="destructive"
              onPress={() => remove.mutate(undefined, { onSuccess: onDeleted })}
              disabled={pending}
            >
              <Text>Supprimer</Text>
            </Button>
          </View>
        </View>
      ) : (
        <Button
          variant="ghost"
          onPress={() => setConfirmingDelete(true)}
          disabled={pending}
          className="justify-start gap-2 px-2"
        >
          <Icon as={Trash2} size={16} className="text-destructive" />
          <Text className="text-sm text-destructive">Supprimer la conversation</Text>
        </Button>
      )}
    </>
  );
}

/**
 * Arborescence cochable.
 *
 * Le retrait est porté par des vues imbriquées plutôt que par une classe
 * calculée depuis la profondeur : avec 5 niveaux possibles, une classe par
 * niveau ne tiendrait pas, et Tailwind ne génère pas de valeur dynamique.
 */
function FolderChecklist({
  nodes,
  selected,
  onToggle,
  disabled,
}: {
  nodes: FolderTreeNode[];
  selected: string[];
  onToggle: (folderId: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      {nodes.map((node) => (
        <View key={node.id}>
          <FolderCheck
            folder={node}
            checked={selected.includes(node.id)}
            onToggle={() => onToggle(node.id)}
            disabled={disabled}
          />
          {node.children.length > 0 ? (
            <View className="ml-4 border-l border-border pl-1">
              <FolderChecklist
                nodes={node.children}
                selected={selected}
                onToggle={onToggle}
                disabled={disabled}
              />
            </View>
          ) : null}
        </View>
      ))}
    </>
  );
}

/** Rangée cochable d'un dossier. */
function FolderCheck({
  folder,
  checked,
  onToggle,
  disabled,
}: {
  folder: Folder;
  checked: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <Button
      variant="ghost"
      onPress={onToggle}
      disabled={disabled}
      // `role` et non `accessibilityRole` : `Button` pose `role="button"` avant
      // d'étaler ses props, et `role` l'emporte sur `accessibilityRole`. Une
      // rangée annoncée « bouton » ne dirait pas qu'elle est cochable.
      role="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={folder.name}
      className="h-11 justify-start gap-3 px-2"
    >
      <View
        className={
          checked
            ? "size-5 items-center justify-center rounded border border-primary bg-primary"
            : "size-5 items-center justify-center rounded border border-border"
        }
      >
        {checked ? <Icon as={Check} size={14} className="text-primary-foreground" /> : null}
      </View>
      <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
        {folder.name}
      </Text>
    </Button>
  );
}
