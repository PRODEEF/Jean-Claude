import { ScrollView } from "react-native";
import { Button } from "@/shared/ui/button";
import { Text } from "@/shared/ui/text";
import type { FolderChoice } from "@/shared/hooks/use-folder-choices";

export type FolderFilterBarProps = {
  /** Dossiers proposés — déjà réduits à ceux qui portent une liste. */
  folders: FolderChoice[];
  /** Vrai s'il existe au moins une liste rangée nulle part. */
  hasUnfiled: boolean;
  /** `undefined` = tous les dossiers, `null` = celles rangées nulle part. */
  value: string | null | undefined;
  onChange: (value: string | null | undefined) => void;
};

/**
 * Filtre par dossier de l'onglet Mes listes.
 *
 * Des boutons alignés plutôt qu'un menu déroulant : le choix se lit sans
 * l'ouvrir, et il y a rarement plus de quelques dossiers porteurs de listes.
 * C'est déjà la forme du rangement dans la fenêtre d'une liste — un seul
 * vocabulaire visuel pour la même notion.
 *
 * Rien à filtrer, rien à afficher : la barre disparaît tant que les listes
 * tiennent toutes au même endroit.
 */
export function FolderFilterBar({ folders, hasUnfiled, value, onChange }: FolderFilterBarProps) {
  if (folders.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1">
      <Button
        size="sm"
        variant={value === undefined ? "secondary" : "outline"}
        onPress={() => onChange(undefined)}
        accessibilityRole="button"
        accessibilityState={{ selected: value === undefined }}
      >
        <Text>Tous</Text>
      </Button>

      {folders.map((folder) => (
        <Button
          key={folder.id}
          size="sm"
          variant={value === folder.id ? "secondary" : "outline"}
          onPress={() => onChange(folder.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === folder.id }}
        >
          <Text>{folder.name}</Text>
        </Button>
      ))}

      {/* En dernier : ce qui n'est rangé nulle part n'est pas un dossier. */}
      {hasUnfiled ? (
        <Button
          size="sm"
          variant={value === null ? "secondary" : "outline"}
          onPress={() => onChange(null)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === null }}
        >
          <Text>Sans dossier</Text>
        </Button>
      ) : null}
    </ScrollView>
  );
}
