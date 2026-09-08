import { ScrollView, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { SegmentedControl, type SegmentedOption } from "@/shared/ui/segmented-control";
import { Text } from "@/shared/ui/text";

/**
 * Cinq segments : les quatre vues calendaires, plus « Todo » — une lecture des
 * todolistes du mois, sans grille d'événements. Elle partage la navigation
 * par mois de la vue Mois : avancer d'une période y a le même sens.
 */
export type CalendarView = "day" | "week" | "month" | "year" | "todo";

export type CalendarToolbarProps = {
  /** Période affichée — son contenu dépend de la vue (jour, mois et année, ou année seule). */
  label: string;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
};

const VIEWS: SegmentedOption<CalendarView>[] = [
  { value: "day", label: "Jour" },
  { value: "week", label: "Semaine" },
  { value: "month", label: "Mois" },
  { value: "year", label: "Année" },
  { value: "todo", label: "Todo" },
];

/**
 * En-tête du calendrier : choix de la vue, navigation, période affichée.
 *
 * Bascule de vue à gauche, bloc période/navigation à droite — écartés au
 * maximum (`justify-between`). À l'intérieur de ce bloc : la période, les
 * deux flèches, puis « Aujourd'hui » en bout de ligne (§4.2, choix produit).
 *
 * Sous le point de rupture, la période passe sur sa propre ligne : la bascule
 * et les commandes de navigation ne tiennent pas à côté d'elle sur la largeur
 * d'un téléphone.
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

  const switcher = <SegmentedControl options={VIEWS} value={view} onChange={onViewChange} />;

  const todayButton = (
    <Button variant="outline" size="sm" onPress={onToday} accessibilityRole="button">
      <Text>Aujourd'hui</Text>
    </Button>
  );

  const arrows = (
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
        <Text className="text-2xl font-semibold" numberOfLines={1}>
          {label}
        </Text>
        <View className="flex-row items-center justify-between gap-2">
          {/* Cinq segments et les commandes de navigation ne tiennent pas sur
              la largeur d'un téléphone. La bascule défile plutôt que de
              déborder : la navigation, elle, doit rester entièrement visible —
              c'est le geste le plus répété du calendrier. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
            {switcher}
          </ScrollView>
          <View className="flex-row items-center gap-1">
            {todayButton}
            {arrows}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row items-center justify-between gap-3">
      {switcher}
      {/* `min-w-0` sur ce groupe et sur le texte qu'il porte : sans eux,
          react-native-web (vraie CSS flexbox) refuse de rétrécir sous leur
          largeur intrinsèque, et une période longue (vue Jour) ferait déborder
          le bandeau au lieu de tronquer. */}
      <View className="min-w-0 flex-row items-center gap-3">
        <Text className="min-w-0 flex-shrink text-sm font-semibold" numberOfLines={1}>
          {label}
        </Text>
        {arrows}
        {todayButton}
      </View>
    </View>
  );
}
