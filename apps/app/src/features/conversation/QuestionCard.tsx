import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MessageCircleQuestion, Pencil, X } from "lucide-react-native";
import { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { NativeOnlyAnimatedView } from "@/shared/ui/native-only-animated-view";
import { useTheme } from "@/shared/providers/theme-provider";

export type QuestionCardProps = {
  question: string;
  /** Réponses proposées, dans l'ordre où le modèle les a données. */
  choices: string[];
  /** Envoie la réponse choisie comme si l'utilisateur l'avait tapée. */
  onChoose: (choice: string) => void;
  /** Donne la main à la saisie libre, sans rien envoyer. */
  onWrite: () => void;
  /** Referme la carte : la question reste lisible dans le fil. */
  onSkip: () => void;
};

/**
 * Question de l'assistant, à répondre d'un appui (§13.4.1).
 *
 * Posée au-dessus de la saisie et non dans le fil : c'est là que ChatGPT,
 * Claude et Perplexity placent leurs réponses suggérées (§4.2), et c'est là
 * que l'œil est au moment de répondre. Les réponses sont numérotées pour
 * qu'on puisse les désigner à l'oral comme à l'écrit.
 *
 * Aucune n'est imposée : « Autre chose » rend la main à la saisie et
 * « Passer » referme la carte. L'assistant propose, il n'enferme pas (§12.1).
 *
 * Elle porte la couleur d'accent, et non le gris des bordures ordinaires :
 * posée entre le fil et la saisie, une carte discrète se lit comme un pied
 * d'écran et se traverse sans être vue — c'est ce qui s'est produit. La
 * question est ce qui attend une réponse à cet instant, elle doit se distinguer
 * de tout ce qui l'entoure.
 */
export function QuestionCard({ question, choices, onChoose, onWrite, onSkip }: QuestionCardProps) {
  const { palette } = useTheme();

  return (
    // L'apparition glissée signale la carte sans la faire clignoter. Le web
    // n'anime pas — la bordure d'accent y porte seule la distinction.
    <NativeOnlyAnimatedView entering={FadeInDown.duration(180).reduceMotion(ReduceMotion.System)}>
      <View
        style={[
          styles.card,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.accent },
        ]}
      >
        <View style={[styles.header, { backgroundColor: palette.accentSoft }]}>
          <MessageCircleQuestion size={16} color={palette.accent} />
          <Text numberOfLines={2} style={[styles.question, { color: palette.accentSoftText }]}>
            {question}
          </Text>
          <Pressable
            onPress={onSkip}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Fermer les réponses proposées"
            style={styles.close}
          >
            <X size={16} color={palette.accentSoftText} />
          </Pressable>
        </View>

        {choices.map((choice, index) => (
          <ChoiceRow key={choice} rank={index + 1} choice={choice} onChoose={onChoose} />
        ))}

        <View style={[styles.footer, { borderTopColor: palette.border }]}>
          <Pressable
            onPress={onWrite}
            accessibilityRole="button"
            accessibilityLabel="Répondre autre chose"
            style={styles.write}
          >
            <Pencil size={14} color={palette.textMuted} />
            <Text style={[styles.writeLabel, { color: palette.textMuted }]}>Autre chose</Text>
          </Pressable>

          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel="Passer la question"
            // 32 pt de haut pour ne pas alourdir le pied de carte ; le débord lui
            // rend la cible tactile de 44 pt.
            hitSlop={{ top: 6, bottom: 6 }}
            style={[styles.skip, { borderColor: palette.border }]}
          >
            <Text style={[styles.skipLabel, { color: palette.textMuted }]}>Passer</Text>
          </Pressable>
        </View>
      </View>
    </NativeOnlyAnimatedView>
  );
}

/**
 * Une réponse proposée.
 *
 * Le survol l'éclaire du même ton que les rangées de la barre latérale : sans
 * ce retour, rien ne distingue à la souris une liste de boutons d'un simple
 * texte à puces. `onHoverIn` ne se déclenche pas au doigt — l'appui, lui, a
 * son propre retour.
 */
function ChoiceRow({
  rank,
  choice,
  onChoose,
}: {
  rank: number;
  choice: string;
  onChoose: (choice: string) => void;
}) {
  const { palette } = useTheme();
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      onPress={() => onChoose(choice)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={choice}
      style={({ pressed }) => [
        styles.choice,
        { borderTopColor: palette.border },
        hovered || pressed ? { backgroundColor: palette.surface } : null,
      ]}
    >
      <Text style={[styles.rank, { color: palette.textMuted }]}>{rank}</Text>
      <Text style={[styles.choiceLabel, { color: palette.text }]}>{choice}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  question: {
    fontFamily: FONT_FAMILY,
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  close: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
  },
  /** Le rang tient sa propre colonne : les libellés restent alignés entre eux. */
  rank: { fontFamily: FONT_FAMILY, width: 16, fontSize: fontSize.xs },
  choiceLabel: { fontFamily: FONT_FAMILY, flex: 1, fontSize: fontSize.sm },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
  },
  write: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    flexShrink: 1,
  },
  writeLabel: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm },
  skip: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  skipLabel: { fontFamily: FONT_FAMILY, fontSize: fontSize.xs, fontWeight: fontWeight.medium },
});
