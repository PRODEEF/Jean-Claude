import { useRef, useState } from "react";
import { View } from "react-native";
import { Folder as FolderIcon } from "lucide-react-native";
import type { Folder } from "@jc/domain";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Text } from "@/shared/ui/text";
import { useFolderActions } from "./hooks/use-folder-actions";

/** Ce que la rangée est en train de nommer. */
export type FolderNameTarget =
  /** `parentId` à `null` pour un dossier racine. */
  | { kind: "create"; parentId: string | null }
  | { kind: "rename"; folder: Folder };

export type FolderNameRowProps = {
  target: FolderNameTarget;
  /** Appelé quand la rangée n'a plus lieu d'être — validée ou abandonnée. */
  onDone: () => void;
};

/**
 * Nommage d'un dossier, saisi sur place dans la barre latérale.
 *
 * Reprend le geste d'un explorateur de fichiers : le nom s'écrit là où le
 * dossier se trouve, Entrée valide, Échap abandonne, et cliquer ailleurs
 * valide aussi. Une fenêtre modale demanderait un aller-retour pour trois
 * mots, et ferait perdre de vue l'endroit concerné.
 *
 * Création et renommage partagent la même rangée : c'est le même geste, à la
 * valeur de départ près.
 */
export function FolderNameRow({ target, onDone }: FolderNameRowProps) {
  const { create, rename } = useFolderActions();
  const [name, setName] = useState(target.kind === "rename" ? target.folder.name : "");
  // Échap démonte la rangée, et le `blur` qui suit ne doit pas enregistrer ce
  // que l'utilisateur vient d'abandonner.
  const abandoned = useRef(false);

  const pending = create.isPending || rename.isPending;
  const failed = create.isError || rename.isError;

  const submit = () => {
    if (abandoned.current || pending) return;

    const trimmed = name.trim();
    // Un nom vide, ou inchangé, ne vaut pas un aller-retour serveur.
    if (trimmed.length === 0 || (target.kind === "rename" && trimmed === target.folder.name)) {
      onDone();
      return;
    }

    if (target.kind === "rename") {
      rename.mutate({ id: target.folder.id, patch: { name: trimmed } }, { onSuccess: onDone });
    } else {
      create.mutate({ name: trimmed, parentId: target.parentId }, { onSuccess: onDone });
    }
  };

  return (
    <View className="gap-1 px-2 py-1">
      <View className="flex-row items-center gap-2">
        <Icon as={FolderIcon} size={16} className="text-muted-foreground" />
        <Input
          value={name}
          onChangeText={setName}
          placeholder="Nom du dossier"
          accessibilityLabel="Nom du dossier"
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
          editable={!pending}
          className="h-8 flex-1"
        />
      </View>

      {/* Message fixe, et non `error.message` : une erreur remontée du serveur
          peut porter des fragments de requête, donc des données utilisateur. */}
      {failed ? (
        <Text className="text-xs text-destructive">Enregistrement impossible. Réessayez.</Text>
      ) : null}
    </View>
  );
}
