import { ActivityIndicator, Image, Pressable, StyleSheet, View } from "react-native";
import { AlertCircle, X } from "lucide-react-native";
import { radius } from "@jc/design";
import { useTheme } from "@/shared/providers/theme-provider";
import { Icon } from "@/shared/ui/icon";

const SIZE = 56;

export type AttachmentThumbnailProps = {
  uri: string;
  status: "uploading" | "done" | "error";
  /** Aperçu plein écran — absent pour une pièce encore en cours d'envoi ou en échec. */
  onPress?: (() => void) | undefined;
  /** Retire la pièce jointe — absent dans le fil, où elle a déjà été envoyée. */
  onRemove?: (() => void) | undefined;
};

/**
 * Vignette d'une image jointe, dans le Composer comme dans le fil.
 *
 * Même composant aux deux endroits : c'est la même donnée, avant et après
 * l'envoi, et deux implémentations auraient divergé au premier ajustement.
 */
export function AttachmentThumbnail({ uri, status, onPress, onRemove }: AttachmentThumbnailProps) {
  const { palette } = useTheme();
  const pressable = status === "done" && onPress !== undefined;

  return (
    <View style={styles.root}>
      <Pressable
        onPress={pressable ? onPress : undefined}
        disabled={!pressable}
        accessibilityRole={pressable ? "button" : undefined}
        accessibilityLabel="Voir l'image en grand"
        style={[styles.frame, { borderColor: status === "error" ? palette.danger : palette.border }]}
      >
        <Image source={{ uri }} style={styles.image} resizeMode="cover" />

        {status === "uploading" ? (
          <View style={styles.overlay}>
            {/* Blanc fixe et non un jeton de palette : le voile qui le porte
                (`styles.overlay`) est lui-même noir fixe, comme celui de
                `SearchDialog` — il ne s'inverse pas avec le thème, et
                `palette.text` y serait illisible en thème clair. */}
            <ActivityIndicator color="#FFFFFF" size="small" />
          </View>
        ) : null}

        {status === "error" ? (
          <View style={styles.overlay}>
            <Icon as={AlertCircle} size={20} color="#FFFFFF" />
          </View>
        ) : null}
      </Pressable>

      {onRemove ? (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel="Retirer la pièce jointe"
          hitSlop={8}
          style={[styles.remove, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          <Icon as={X} size={12} className="text-foreground" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: SIZE, height: SIZE },
  frame: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  remove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
