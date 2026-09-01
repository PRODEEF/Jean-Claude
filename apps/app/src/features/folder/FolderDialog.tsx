import { useState } from "react";
import { View } from "react-native";
import { FolderPlus, Trash2 } from "lucide-react-native";
import { MAX_FOLDER_DEPTH, type Folder } from "@jc/domain";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Separator } from "@/shared/ui/separator";
import { Text } from "@/shared/ui/text";
import { useFolderActions } from "./hooks/use-folder-actions";

/** Ce que la fenêtre est en train de faire. `parent` renseigné = sous-dossier. */
export type FolderDialogTarget =
  | { mode: "create"; parent: Folder | null }
  /** `depth` vaut 1 pour un dossier racine — dit si le dossier peut encore descendre. */
  | { mode: "edit"; folder: Folder; depth: number };

export type FolderDialogProps = {
  /** `null` = fenêtre fermée. */
  target: FolderDialogTarget | null;
  onClose: () => void;
  /** Bascule la fenêtre en création d'un sous-dossier du dossier édité. */
  onAddChild: (parent: Folder) => void;
};

/**
 * Fenêtre unique portant toutes les actions d'un dossier.
 *
 * Un menu déroulant menant à d'autres fenêtres coûterait deux composants de
 * plus et se manipule mal au doigt, alors que la même barre latérale sert le
 * web et le mobile. Tout tient donc ici : nom, sous-dossier, suppression.
 */
export function FolderDialog({ target, onClose, onAddChild }: FolderDialogProps) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {/* La clé remonte le formulaire quand la cible change sans que la
            fenêtre se referme — le cas de « Ajouter un sous-dossier », qui
            enchaîne sur une création sans repasser par la barre latérale. */}
        {target ? (
          <FolderForm
            key={target.mode === "edit" ? target.folder.id : `new-${target.parent?.id ?? "root"}`}
            target={target}
            onClose={onClose}
            onAddChild={onAddChild}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FolderForm({
  target,
  onClose,
  onAddChild,
}: {
  target: FolderDialogTarget;
  onClose: () => void;
  onAddChild: (parent: Folder) => void;
}) {
  const { create, rename, remove } = useFolderActions();
  const [name, setName] = useState(target.mode === "edit" ? target.folder.name : "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const pending = create.isPending || rename.isPending || remove.isPending;
  const failed = create.isError || rename.isError || remove.isError;
  const trimmed = name.trim();

  const submit = () => {
    if (trimmed.length === 0 || pending) return;

    if (target.mode === "edit") {
      rename.mutate({ id: target.folder.id, patch: { name: trimmed } }, { onSuccess: onClose });
    } else {
      create.mutate({ name: trimmed, parentId: target.parent?.id ?? null }, { onSuccess: onClose });
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {target.mode === "edit"
            ? target.folder.name
            : target.parent
              ? "Nouveau sous-dossier"
              : "Nouveau dossier"}
        </DialogTitle>
        {target.mode === "create" && target.parent ? (
          <DialogDescription>Il sera rangé dans « {target.parent.name} ».</DialogDescription>
        ) : null}
      </DialogHeader>

      <Input
        value={name}
        onChangeText={setName}
        placeholder="Nom du dossier"
        accessibilityLabel="Nom du dossier"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
        editable={!pending}
      />

      {/* Message fixe, et non `error.message` : une erreur remontée du serveur
          peut porter des fragments de requête, donc des données utilisateur. */}
      {failed ? (
        <Text className="text-sm text-destructive">
          L'opération a échoué. Réessayez dans un instant.
        </Text>
      ) : null}

      <DialogFooter>
        <Button variant="outline" onPress={onClose} disabled={pending}>
          <Text>Annuler</Text>
        </Button>
        <Button onPress={submit} disabled={trimmed.length === 0 || pending}>
          <Text>{target.mode === "edit" ? "Enregistrer" : "Créer"}</Text>
        </Button>
      </DialogFooter>

      {target.mode === "edit" ? (
        <>
          <Separator />

          <View className="gap-1">
            {/* L'arborescence est bornée à `MAX_FOLDER_DEPTH` niveaux : au
                dernier, un sous-dossier ne rentre plus. Le serveur le refuse
                déjà, autant ne pas proposer le geste. */}
            {target.depth < MAX_FOLDER_DEPTH ? (
              <Button
                variant="ghost"
                onPress={() => onAddChild(target.folder)}
                disabled={pending}
                className="justify-start gap-2 px-2"
              >
                <Icon as={FolderPlus} size={16} className="text-muted-foreground" />
                <Text className="text-sm text-foreground">Ajouter un sous-dossier</Text>
              </Button>
            ) : null}

            {confirmingDelete ? (
              <View className="gap-2">
                <Text className="text-sm text-muted-foreground">
                  Supprimer « {target.folder.name} » ? Les conversations qu'il contient ne sont pas
                  supprimées : elles perdent seulement ce rangement.
                </Text>
                <View className="flex-row justify-end gap-2">
                  <Button
                    variant="outline"
                    onPress={() => setConfirmingDelete(false)}
                    disabled={pending}
                  >
                    <Text>Annuler</Text>
                  </Button>
                  <Button
                    variant="destructive"
                    onPress={() => remove.mutate(target.folder.id, { onSuccess: onClose })}
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
                <Text className="text-sm text-destructive">Supprimer le dossier</Text>
              </Button>
            )}
          </View>
        </>
      ) : null}
    </>
  );
}
