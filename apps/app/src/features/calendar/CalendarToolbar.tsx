import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { SegmentedControl, type SegmentedOption } from "@/shared/ui/segmented-control";
import { Text } from "@/shared/ui/text";

export type CalendarView = "day" | "week" | "month" | "year";

export type CalendarToolbarProps = {
  label: string;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
};

/**
 * Ce que la bascule peut porter : les quatre vues, plus un raccourci.
 *
 * « Todo » n'est pas une cinquième période mais un passage vers l'onglet
 * Mes listes. Il est placé là parce que c'est là que l'œil cherche les autres
 * lectures du temps, et `CalendarView` n'a pas à s'en trouver élargi : ni le
 * cadrage, ni le libellé de période, ni la fenêtre chargée n'auraient de sens
 * pour lui.
 */
type ToolbarSegment = CalendarView | "todo";

const VIEWS: SegmentedOption<ToolbarSegment>[] = [
  { value: "day", label: "Jour" },
  { value: "week", label: "Semaine" },
  { value: "month", label: "Mois" },
  { value: "year", label: "Année" },
  { value: "todo", label: "Todo" },
];

/**
 * En-tête du calendrier : période affichée, choix de la vue, navigation.
 *
 * Les trois références du domaine placent identiquement ces trois blocs —
 * période à gauche, bascule de vue au centre, flèches et « Aujourd'hui » à
 * droite (§4.2) — et c'est aussi la disposition de la maquette web.
 *
 * Sous le point de rupture, la période passe sur sa propre ligne : la bascule
 * et les trois commandes de navigation ne tiennent pas à côté d'elle sur la
 * largeur d'un téléphone.
 */
export function CalendarToolbar({
  label,
  view,
  onViewChange,
  onPrevious,
  onNext,
  onToday,
}: CalendarToolbarProps) {
  const compact = useBreakpoint() === "compact";
  const router = useRouter();

  const select = (next: ToolbarSegment) => {
    if (next === "todo") {
      router.push("/todo");
      return;
    }
    onViewChange(next);
  };

  const period = (
    <Text className="text-2xl font-semibold" numberOfLines={1}>
      {label}
    </Text>
  );

  const switcher = <SegmentedControl options={VIEWS} value={view} onChange={select} />;

  const navigation = (
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
  );

  if (compact) {
    return (
      <View className="gap-3">
        {period}
        <View className="flex-row items-center justify-between gap-2">
          {/* Cinq segments et trois commandes de navigation ne tiennent pas sur
              la largeur d'un téléphone. La bascule défile plutôt que de
              déborder : la navigation, elle, doit rester entièrement visible —
              c'est le geste le plus répété du calendrier. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
            {switcher}
          </ScrollView>
          {navigation}
        </View>
      </View>
    );
  }

  // Les deux zones latérales portent le même `flex-1` : la bascule de vue reste
  // optiquement centrée quelle que soit la longueur de la période affichée.
  return (
    <View className="flex-row items-center gap-3">
      <View className="min-w-0 flex-1">{period}</View>
      {switcher}
      <View className="min-w-0 flex-1 flex-row justify-end">{navigation}</View>
    </View>
  );
}
