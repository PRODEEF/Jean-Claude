import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Cog } from "lucide-react-native";
import { fontSize, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useAssistantName } from "@/shared/hooks/use-profile";
import { useTheme } from "@/shared/providers/theme-provider";

/**
 * Attente de la réponse : une roue qui tourne et le temps déjà écoulé (§4.2).
 *
 * Le compteur seul, en texte immobile, se lisait comme un écran figé : la roue
 * dit que ça travaille, le compteur depuis combien de temps. Demande de Yann,
 * sur le modèle de Claude.
 *
 * Rendu pendant tout le tour, et non plus seulement jusqu'au premier jeton :
 * une fois le texte écrit, le modèle peut encore préparer une proposition
 * (création de dossiers, liste…) que le fil relit ensuite — plusieurs secondes
 * où rien ne bougeait avant que la carte n'apparaisse.
 */
export function ThinkingIndicator() {
  const { palette } = useTheme();
  const name = useAssistantName();
  const seconds = useElapsedSeconds();

  return (
    <View style={styles.row}>
      <SpinningCog size={14} color={palette.textMuted} />
      <Text
        style={[styles.label, { color: palette.textMuted }]}
        // Le libellé annoncé ne porte pas le compteur : une synthèse vocale le
        // relirait à chaque seconde.
        accessibilityLabel={`${name} rédige sa réponse`}
      >
        {name} réfléchit…{seconds > 0 ? ` ${seconds} s` : ""}
      </Text>
    </View>
  );
}

/**
 * Roue dentée qui tourne tant qu'elle est montée.
 *
 * Immobile quand l'appareil demande de réduire les animations : une rotation
 * sans fin est précisément ce que ce réglage cherche à éviter, et le compteur
 * qui l'accompagne suffit alors à dire que l'attente avance.
 */
export function SpinningCog({ size, color }: { size: number; color: string }) {
  const reducedMotion = useReducedMotion();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    rotation.value = withRepeat(
      withTiming(360, { duration: 1600, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(rotation);
  }, [reducedMotion, rotation]);

  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={spin} aria-hidden>
      <Cog size={size} color={color} />
    </Animated.View>
  );
}

/**
 * Secondes écoulées depuis le montage.
 *
 * Recalculées depuis l'instant de départ plutôt qu'incrémentées d'une unité :
 * un onglet mis en veille suspend le minuteur, et un compteur qui reprendrait
 * où il en était afficherait moins que le temps réellement attendu.
 */
export function useElapsedSeconds(): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return seconds;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  label: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm },
});
