import type { ComponentType } from "react";
import { Switch as PlatformSwitch, type SwitchProps } from "react-native";
import { useTheme } from "@/shared/providers/theme-provider";

/**
 * `activeThumbColor` n'existe pas dans le typage de React Native, mais
 * react-native-web la lit — c'est elle qui décide de la couleur du bouton à
 * l'état actif, `thumbColor` n'y valant que pour l'état inactif
 * (`react-native-web/dist/exports/Switch`). Sans elle, le bouton reste au vert
 * par défaut de la bibliothèque, étranger à la palette.
 *
 * Le typage est élargi ici plutôt qu'à chaque appel : la propriété est
 * inoffensive sur iOS et Android, où `thumbColor` vaut pour les deux états.
 */
type ThemedSwitchProps = SwitchProps & { activeThumbColor?: string };

const PlatformSwitchWithActiveThumb = PlatformSwitch as ComponentType<ThemedSwitchProps>;

/**
 * Interrupteur aux couleurs de l'assistant.
 *
 * Le bouton porte la couleur choisie dans les réglages (§4.5), le rail son
 * aplat atténué — clair en thème clair, sombre en thème sombre. Centralisé
 * parce que les couleurs se posent en quatre propriétés dont trois sont des
 * pièges : les recopier à chaque interrupteur les ferait diverger au premier
 * oubli.
 */
export function Switch(props: SwitchProps) {
  const { palette } = useTheme();

  return (
    <PlatformSwitchWithActiveThumb
      thumbColor={palette.accent}
      activeThumbColor={palette.accent}
      trackColor={{ true: palette.accentSoft, false: palette.border }}
      ios_backgroundColor={palette.border}
      {...props}
    />
  );
}
