import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fontSize, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useAssistantName } from "@/shared/hooks/use-profile";
import { useTheme } from "@/shared/providers/theme-provider";

/**
 * Attente de la réponse, avec le temps déjà écoulé (§4.2).
 *
 * Une roue qui tourne ne dit rien de l'attente : au bout de cinq secondes,
 * l'utilisateur ne sait pas s'il patiente normalement ou si quelque chose est
 * cassé. Le compteur répond à cette question — c'est ce qu'affichent ChatGPT et
 * Claude pendant leur temps de réflexion.
 *
 * Rendu uniquement tant qu'aucun jeton n'est arrivé : le texte qui s'écrit
 * prouve ensuite de lui-même que la génération avance.
 */
export function ThinkingIndicator() {
  const { palette } = useTheme();
  const name = useAssistantName();
  const seconds = useElapsedSeconds();

  return (
    <View style={styles.row}>
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
 * Secondes écoulées depuis le montage.
 *
 * Recalculées depuis l'instant de départ plutôt qu'incrémentées d'une unité :
 * un onglet mis en veille suspend le minuteur, et un compteur qui reprendrait
 * où il en était afficherait moins que le temps réellement attendu.
 */
function useElapsedSeconds(): number {
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
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm },
  label: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm },
});
