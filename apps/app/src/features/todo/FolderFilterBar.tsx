import { ScrollView, View } from "react-native";
import type { ListPeriod } from "@jc/domain";
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
  /** Période retenue : `undefined` = toutes les dates. */
  period: ListPeriod | undefined;
  onPeriodChange: (period: ListPeriod | undefined) => void;
};

const PERIODS: { value: ListPeriod; label: string }[] = [
  { value: "past", label: "Passé" },
  { value: "undated", label: "Sans date" },
];

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
export function FolderFilterBar({
  folders,
  hasUnfiled,
  value,
  onChange,
  period,
  onPeriodChange,
}: FolderFilterBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="items-center gap-1"
    >
      {/* Passé et Sans date se cumulent avec le dossier : « le passé de Santé ».
          Un second appui relâche la période. */}
      {PERIODS.map((item) => (
        <Button
          key={item.value}
          size="sm"
          variant={period === item.value ? "secondary" : "outline"}
          onPress={() => onPeriodChange(period === item.value ? undefined : item.value)}
          accessibilityRole="button"
          accessibilityState={{ selected: period === item.value }}
        >
          <Text>{item.label}</Text>
        </Button>
      ))}

      {folders.length > 0 ? <View className="bg-border mx-1 h-5 w-px" /> : null}

      {folders.length > 0 ? (
        <Button
          size="sm"
          variant={value === undefined ? "secondary" : "outline"}
          onPress={() => onChange(undefined)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === undefined }}
        >
          <Text>Tous</Text>
        </Button>
      ) : null}

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
      {hasUnfiled && folders.length > 0 ? (
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
