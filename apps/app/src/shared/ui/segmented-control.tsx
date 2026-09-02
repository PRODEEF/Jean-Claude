import { View } from "react-native";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Text } from "@/shared/ui/text";

export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

/**
 * Bascule entre vues exclusives — les périodes du calendrier, les deux
 * lectures de la todoliste.
 *
 * La vue courante prend l'aplat atténué de la couleur d'assistant : clair en
 * thème clair, sombre en thème sombre. Le `secondary` de shadcn s'en
 * approchait trop — sur le rail `muted`, la sélection ne se voyait pas.
 *
 * Partagé plutôt que recopié : les deux écrans qui en portent un l'avaient
 * écrit deux fois à l'identique, et la correction n'aurait tenu que d'un côté.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <View className="bg-muted flex-row gap-1 rounded-full p-1">
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Button
            key={option.value}
            size="sm"
            variant="ghost"
            className={cn("rounded-full", selected && "bg-accent-soft")}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text
              className={
                selected ? "text-accent-soft-foreground font-semibold" : "text-muted-foreground"
              }
            >
              {option.label}
            </Text>
          </Button>
        );
      })}
    </View>
  );
}
