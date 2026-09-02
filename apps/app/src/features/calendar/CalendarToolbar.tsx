import { View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";

export type CalendarView = "month" | "week";

export type CalendarToolbarProps = {
  label: string;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
};

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Mois" },
  { value: "week", label: "Semaine" },
];

/**
 * En-tête du calendrier : période affichée, choix de la vue, navigation.
 *
 * Les trois références du domaine placent identiquement ces trois blocs —
 * période à gauche, bascule de vue au centre, flèches et « Aujourd'hui » à
 * droite (§4.2) — et c'est aussi la disposition de la maquette web.
 */
export function CalendarToolbar({
  label,
  view,
  onViewChange,
  onPrevious,
  onNext,
  onToday,
}: CalendarToolbarProps) {
  return (
    <View className="gap-3">
      <Text className="text-xl font-semibold">{label}</Text>

      <View className="flex-row items-center justify-between gap-2">
        <View className="bg-muted flex-row gap-1 rounded-full p-1">
          {VIEWS.map((item) => (
            <Button
              key={item.value}
              size="sm"
              variant={view === item.value ? "secondary" : "ghost"}
              className="rounded-full"
              onPress={() => onViewChange(item.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: view === item.value }}
            >
              <Text>{item.label}</Text>
            </Button>
          ))}
        </View>

        <View className="flex-row items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET }}
            onPress={onPrevious}
            accessibilityRole="button"
            accessibilityLabel="Période précédente"
          >
            <Icon as={ChevronLeft} className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onPress={onToday} accessibilityRole="button">
            <Text>Aujourd'hui</Text>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET }}
            onPress={onNext}
            accessibilityRole="button"
            accessibilityLabel="Période suivante"
          >
            <Icon as={ChevronRight} className="size-4" />
          </Button>
        </View>
      </View>
    </View>
  );
}
