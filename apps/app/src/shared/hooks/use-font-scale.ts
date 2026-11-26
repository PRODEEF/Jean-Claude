import { useEffect } from "react";
import { Platform } from "react-native";
import { FONT_SCALE_FACTORS } from "@jc/domain";
import { useProfile } from "@/shared/hooks/use-profile";

/**
 * Applique la taille de texte choisie à toute l'application (Réglages ›
 * Apparence).
 *
 * Sur le web, le facteur passe par `zoom` sur la racine : texte, icônes,
 * boutons et espacements grandissent ensemble, comme avec le zoom du
 * navigateur mais retenu dans le compte — l'écran remplit toujours la fenêtre.
 * Sur téléphone, le réglage reste enregistré mais n'a pas encore d'effet : React
 * Native n'a pas d'équivalent global, il faudra passer par chaque texte.
 */
export function useApplyFontScale(): void {
  const scale = useProfile().data?.preferences.fontScale ?? "normal";

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const root = document.documentElement;
    root.style.zoom = scale === "normal" ? "" : String(FONT_SCALE_FACTORS[scale]);
    return () => {
      root.style.zoom = "";
    };
  }, [scale]);
}
