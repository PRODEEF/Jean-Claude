import { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react-native";
import type { Conversation, Folder, FolderTreeNode } from "@jc/domain";
import { api } from "@/shared/lib/api";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
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
  if (!conversation) return null;

  return (
    <ConversationForm
      key={conversation.id}
      conversation={conversation}
      onClose={onClose}
      onDeleted={onDeleted}
    />
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
    <Modal
      open
      onClose={onClose}
      title="Conversation"
      description="Renommez-la, et cochez tous les dossiers dont elle relève."
      // Message fixe, et non `error.message` : une erreur remontée du serveur
      // peut porter des fragments de requête, donc des données utilisateur.
      error={
        save.isError || remove.isError ? "L'opération a échoué. Réessayez dans un instant." : null
      }
      // Une bascule du libellé plutôt qu'une seconde fenêtre par-dessus
      // celle-ci : deux modales superposées ne disent plus laquelle répond à
      // quoi. C'est déjà la forme retenue pour supprimer une todoliste.
      destructiveAction={{
        label: confirmingDelete ? "Confirmer la suppression" : "Supprimer la conversation",
        variant: confirmingDelete ? "destructive" : "ghost",
        disabled: pending,
        onPress: () => {
          if (!confirmingDelete) {
            setConfirmingDelete(true);
            return;
          }
          remove.mutate(undefined, { onSuccess: onDeleted });
        },
      }}
      actions={[
        { label: "Annuler", onPress: onClose, disabled: pending },
        {
          label: "Enregistrer",
          variant: "default",
          onPress: submit,
          disabled: trimmed.length === 0 || pending,
        },
      ]}
    >
      <View className="gap-2">
        <Text className="text-muted-foreground text-xs">Titre</Text>
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder="Titre de la conversation"
          accessibilityLabel="Titre de la conversation"
          returnKeyType="done"
          onSubmitEditing={submit}
          editable={!pending}
        />
      </View>

      <View className="gap-2">
        <Text className="text-muted-foreground text-xs">Ranger dans des dossiers</Text>

        {roots.length === 0 ? (
          <Text className="text-muted-foreground text-sm italic">
            Aucun dossier pour le moment. Créez-en un depuis la liste des dossiers.
          </Text>
        ) : (
          <View className="border-border overflow-hidden rounded-md border">
            <FolderChecklist
              nodes={roots}
              selected={selected}
              onToggle={toggle}
              disabled={pending}
            />
          </View>
        )}
      </View>
    </Modal>
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
            <View className="border-border ml-5 border-l pl-1">
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
      className="h-11 justify-start gap-3 rounded-none px-3 sm:h-11"
    >
      <View
        className={
          checked
            ? "border-primary bg-primary size-5 items-center justify-center rounded border"
            : "border-border size-5 items-center justify-center rounded border"
        }
      >
        {checked ? <Icon as={Check} size={14} className="text-primary-foreground" /> : null}
      </View>
      <Text className="text-foreground flex-1 text-sm" numberOfLines={1}>
        {folder.name}
      </Text>
    </Button>
  );
}
