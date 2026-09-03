import type { ReactNode, RefObject } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useTheme } from "@/shared/providers/theme-provider";

/**
 * Plafond de la colonne de contenu, selon ce qu'elle porte.
 *
 * Du texte au-delà de 900 pt se lit mal — l'œil perd sa ligne au retour. Une
 * grille, elle, gagne à respirer : le calendrier et la todoliste montent à
 * 1100 pt. C'est le seul paramètre qui distingue les écrans entre eux.
 */
export const READING_MAX_WIDTH = 900;
export const GRID_MAX_WIDTH = 1100;

/** Hauteur du bandeau, alignée sur celle de la bannière de l'application. */
const HEADER_HEIGHT = 56;

/** Part de la largeur disponible qu'occupe le contenu au-delà du point de rupture. */
const CONTENT_WIDTH_RATIO = "80%";

/**
 * Colonne de contenu : centrée, bornée, et pleine largeur sur téléphone.
 *
 * Exportée plutôt que gardée interne : le fil de conversation porte son propre
 * défilement — une `FlatList` imbriquée dans un `ScrollView` perdrait sa
 * virtualisation — et doit pourtant s'aligner sur la même colonne que les
 * écrans qui passent par `ScreenShell`.
 */
export function contentColumn(compact: boolean, maxWidth: number): ViewStyle {
  return compact
    ? { width: "100%", paddingHorizontal: spacing.lg }
    : { width: CONTENT_WIDTH_RATIO, maxWidth, alignSelf: "center" };
}

export type ScreenHeaderProps = {
  title: string;
  /** Commande de droite : le « … » d'un fil, le bouton d'ajout d'un écran. */
  action?: ReactNode;
  /** Retour vers la liste — n'a de sens que lorsque la barre latérale est escamotée. */
  onBack?: (() => void) | undefined;
};

/**
 * Bandeau de tête, commun à tous les écrans.
 *
 * Pleine largeur et non borné comme le contenu : c'est un bandeau d'écran, le
 * titre se cale au bord gauche et la commande au bord droit. Le suivre sur la
 * largeur du contenu les ramènerait tous deux vers le centre sur grand écran,
 * sans rien y gagner.
 *
 * Hauteur fixe et contenu centré verticalement : les écrans n'ont ni la même
 * commande ni le même retour, et une hauteur laissée au contenu ferait sauter
 * le bandeau d'un écran à l'autre.
 */
export function ScreenHeader({ title, action, onBack }: ScreenHeaderProps) {
  const { palette } = useTheme();

  return (
    <View style={[styles.header, { borderBottomColor: palette.border }]}>
      {/* Dans la rangée et non au-dessus : une seconde ligne rendrait la
          hauteur du bandeau dépendante de l'écran affiché. */}
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Revenir à la liste des conversations"
          hitSlop={8}
          style={styles.back}
        >
          <ChevronLeft size={20} color={palette.accent} />
        </Pressable>
      ) : null}

      <Text numberOfLines={1} style={[styles.title, { color: palette.text }]}>
        {title}
      </Text>

      {action}
    </View>
  );
}

export type ScreenShellProps = ScreenHeaderProps & {
  children: ReactNode;
  /** Plafond de la colonne — `GRID_MAX_WIDTH` pour une grille, `READING_MAX_WIDTH` sinon. */
  maxWidth?: number;
  /**
   * Le contenu porte lui-même son défilement : le shell ne pose alors que le
   * bandeau et laisse la place restante à l'enfant. C'est le cas du fil de
   * conversation, dont la `FlatList` ne peut pas vivre dans un `ScrollView`.
   */
  scrolls?: boolean;
  /** Donne la main sur le défilement de la page — cadrage d'une grille horaire. */
  scrollRef?: RefObject<ScrollView | null>;
};

/**
 * Ossature commune des écrans : bandeau fixe, puis colonne centrée qui défile.
 *
 * Le défilement est celui de la colonne et non de la page entière : le bandeau
 * reste en place, et l'utilisateur garde sous les yeux le titre de ce qu'il
 * parcourt.
 */
export function ScreenShell({
  title,
  action,
  onBack,
  children,
  maxWidth = READING_MAX_WIDTH,
  scrolls = true,
  scrollRef,
}: ScreenShellProps) {
  const { palette } = useTheme();
  const compact = useBreakpoint() === "compact";

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <ScreenHeader title={title} action={action} onBack={onBack} />

      {scrolls ? (
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[styles.content, contentColumn(compact, maxWidth)]}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    width: "100%",
  },
  back: {
    width: MIN_TOUCH_TARGET - spacing.md,
    height: MIN_TOUCH_TARGET - spacing.md,
    marginLeft: -spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: FONT_FAMILY,
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  scroll: { flex: 1 },
  content: { paddingVertical: spacing.lg, gap: spacing.lg },
});
