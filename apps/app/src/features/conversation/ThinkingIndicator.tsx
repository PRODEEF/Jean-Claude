import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Cog } from "lucide-react-native";
import { fontSize, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useAssistantName } from "@/shared/hooks/use-profile";
import { useTheme } from "@/shared/providers/theme-provider";

/**
 * Attente de la réponse : une vaguelette de pixels et le temps déjà écoulé (§4.2).
 *
 * Le compteur seul, en texte immobile, se lisait comme un écran figé : les
 * pixels disent que ça travaille, le compteur depuis combien de temps. Yann a
 * demandé une animation pixelisée à la place de la roue dentée.
 *
 * Rendu pendant tout le tour, et non plus seulement jusqu'au premier jeton :
 * une fois le texte écrit, le modèle peut encore préparer une proposition
 * (création de dossiers, liste…) que le fil relit ensuite — plusieurs secondes
 * où rien ne bougeait avant que la carte n'apparaisse.
 */
export function ThinkingIndicator({
  dense = false,
  assistantName,
}: {
  dense?: boolean;
  /** Dans un groupe, tous les membres voient le même nom, pas celui d'un profil. */
  assistantName?: string;
}) {
  const { palette } = useTheme();
  const profileName = useAssistantName();
  const name = assistantName ?? profileName;
  const seconds = useElapsedSeconds();

  return (
    <View style={[styles.row, dense && styles.dense]}>
      <PixelWave color={palette.textMuted} />
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

const PIXEL_COUNT = 4;
const PIXEL_SIZE = 4;
const PIXEL_STEP_MS = 140;

/**
 * Quatre carrés qui sautent l'un après l'autre, sans arrondi ni dégradé : le
 * style pixel-art demandé. Immobile quand l'appareil demande de réduire les
 * animations, comme la roue dentée.
 */
export function PixelWave({ color }: { color: string }) {
  return (
    <View style={styles.pixels} aria-hidden>
      {Array.from({ length: PIXEL_COUNT }, (_, index) => (
        <Pixel key={index} index={index} color={color} />
      ))}
    </View>
  );
}

function Pixel({ index, color }: { index: number; color: string }) {
  const reducedMotion = useReducedMotion();
  const lift = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    // Une marche d'un pixel, pas un glissement : le mouvement reste crénelé.
    const hop = withSequence(
      withTiming(-PIXEL_SIZE, { duration: PIXEL_STEP_MS, easing: Easing.steps(1, true) }),
      withTiming(0, { duration: PIXEL_STEP_MS, easing: Easing.steps(1, true) }),
      withTiming(0, { duration: PIXEL_STEP_MS * (PIXEL_COUNT - 1) }),
    );
    lift.value = withDelay(index * PIXEL_STEP_MS, withRepeat(hop, -1, false));
    return () => cancelAnimation(lift);
  }, [index, lift, reducedMotion]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));

  return (
    <Animated.View
      style={[{ width: PIXEL_SIZE, height: PIXEL_SIZE, backgroundColor: color }, style]}
    />
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
  // Hauteur réservée au saut : sans elle la ligne bougerait avec les pixels.
  pixels: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    height: PIXEL_SIZE * 2,
    width: PIXEL_COUNT * PIXEL_SIZE + (PIXEL_COUNT - 1) * 2,
  },
  // Dans un groupe, la ligne d'état a une hauteur réservée : sans cela le
  // champ de saisie sauterait à l'apparition de l'indicateur.
  dense: { paddingVertical: 0 },
  label: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm },
});
