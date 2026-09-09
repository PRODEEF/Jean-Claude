import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AlertCircle, FileText, X } from "lucide-react-native";
import { fontSize, radius, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useTheme } from "@/shared/providers/theme-provider";
import { Icon } from "@/shared/ui/icon";

const WIDTH = 168;

export type AttachmentFileCardProps = {
  fileName: string;
  byteSize: number;
  status: "uploading" | "done" | "error";
  /** Aperçu du texte extrait — absent pour une pièce encore en cours d'envoi ou en échec. */
  onPress?: (() => void) | undefined;
  /** Retire la pièce jointe — absent dans le fil, où elle a déjà été envoyée. */
  onRemove?: (() => void) | undefined;
};

function formatByteSize(byteSize: number): string {
  if (byteSize < 1024) return `${byteSize} o`;
  const kilobytes = byteSize / 1024;
  if (kilobytes < 1024) return `${Math.round(kilobytes)} Ko`;
  return `${(kilobytes / 1024).toFixed(1)} Mo`;
}

/**
 * Pendant PDF de `AttachmentThumbnail` — icône et nom plutôt qu'une vignette,
 * le PDF ne se prêtant pas à un aperçu miniature (§13.4.1).
 */
export function AttachmentFileCard({
  fileName,
  byteSize,
  status,
  onPress,
  onRemove,
}: AttachmentFileCardProps) {
  const { palette } = useTheme();
  const pressable = status === "done" && onPress !== undefined;

  return (
    <View style={styles.root}>
      <Pressable
        onPress={pressable ? onPress : undefined}
        disabled={!pressable}
        accessibilityRole={pressable ? "button" : undefined}
        accessibilityLabel={`Voir le texte extrait de ${fileName}`}
        style={[
          styles.frame,
          { backgroundColor: palette.surface, borderColor: status === "error" ? palette.danger : palette.border },
        ]}
      >
        <Icon as={FileText} size={20} className="text-muted-foreground" />
        <View style={styles.labels}>
          <Text numberOfLines={1} style={[styles.fileName, { color: palette.text }]}>
            {fileName}
          </Text>
          <Text style={[styles.byteSize, { color: palette.textMuted }]}>{formatByteSize(byteSize)}</Text>
        </View>

        {status === "uploading" ? <ActivityIndicator color={palette.textMuted} size="small" /> : null}
        {status === "error" ? <Icon as={AlertCircle} size={16} className="text-destructive" /> : null}
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
  root: { width: WIDTH },
  frame: {
    width: WIDTH,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  labels: { flex: 1, gap: 2 },
  fileName: { fontFamily: FONT_FAMILY, fontSize: fontSize.sm },
  byteSize: { fontFamily: FONT_FAMILY, fontSize: fontSize.xs },
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
