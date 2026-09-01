import { Pressable, StyleSheet, Text, View } from "react-native";
import { createProjectFoldersPayloadSchema, type Suggestion } from "@jc/domain";
import { fontSize, fontWeight, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { useTheme } from "@/shared/providers/theme-provider";

export type SuggestionCardProps = {
  suggestion: Suggestion;
  onAccept: () => void;
  onDismiss: () => void;
  /** Une réponse est en cours d'envoi : les deux gestes sont neutralisés. */
  isPending: boolean;
};

/**
 * Proposition de l'assistant, acceptée ou ignorée d'un geste (§12.1).
 *
 * Rendue en fin de fil et non dans la bulle du message : c'est là que ChatGPT,
 * Claude et Perplexity posent leurs cartes d'action (§4.2), et une proposition
 * n'est de toute façon rattachée à aucun message en particulier.
 */
export function SuggestionCard({
  suggestion,
  onAccept,
  onDismiss,
  isPending,
}: SuggestionCardProps) {
  const { palette } = useTheme();
  const proposed = createProjectFoldersPayloadSchema.safeParse(suggestion.payload);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.message, { color: palette.text }]}>{suggestion.message}</Text>

      {/* L'aperçu est un confort : une charge utile illisible ne doit pas
          empêcher l'utilisateur de trancher. */}
      {proposed.success ? (
        <View style={[styles.tree, { borderLeftColor: palette.border }]}>
          {proposed.data.folders.map((folder) => (
            <View key={folder.name} style={styles.branch}>
              <Text style={[styles.folder, { color: palette.text }]}>{folder.name}</Text>
              {folder.children.map((child) => (
                <Text key={child.name} style={[styles.child, { color: palette.textMuted }]}>
                  {child.name}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onAccept}
          disabled={isPending}
          accessibilityRole="button"
          accessibilityLabel="Créer les dossiers proposés"
          style={[styles.action, { backgroundColor: palette.accent, opacity: isPending ? 0.4 : 1 }]}
        >
          <Text style={[styles.actionLabel, { color: palette.accentText }]}>
            Créer les dossiers
          </Text>
        </Pressable>

        <Pressable
          onPress={onDismiss}
          disabled={isPending}
          accessibilityRole="button"
          accessibilityLabel="Ignorer la proposition"
          style={[
            styles.action,
            styles.secondary,
            { borderColor: palette.border, opacity: isPending ? 0.4 : 1 },
          ]}
        >
          <Text style={[styles.actionLabel, { color: palette.textMuted }]}>Ignorer</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "flex-start",
    maxWidth: "85%",
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  message: { fontSize: fontSize.md, lineHeight: 22 },
  tree: { gap: spacing.sm, paddingLeft: spacing.md, borderLeftWidth: 2 },
  branch: { gap: spacing.xs },
  folder: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  child: { fontSize: fontSize.sm, paddingLeft: spacing.md },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  secondary: { borderWidth: 1 },
  actionLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
