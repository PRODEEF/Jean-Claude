import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text as NativeText, View } from "react-native";
import { createTaskListsPayloadSchema, type Suggestion } from "@jc/domain";
import { fontSize, MIN_TOUCH_TARGET, radius, spacing } from "@jc/design";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { useTheme } from "@/shared/providers/theme-provider";
import { Text } from "@/shared/ui/text";
import { useDetailPane } from "@/shared/providers/detail-pane";
import { useSuggestions } from "./hooks/use-suggestions";
import { ResolvedSuggestionNote, SuggestionCard } from "./SuggestionCard";

/**
 * Une proposition de l'assistant, dans le volet de droite : la même carte que
 * dans le fil, déplacée. L'assistant propose, rien n'est créé avant le geste
 * de l'utilisateur (§12.1).
 *
 * Elle relit les propositions du fil plutôt que de recevoir l'objet : une fois
 * validée ou ignorée, la carte laisse la place à la note de résultat.
 */
export function SuggestionPaneBody({
  conversationId,
  suggestionId,
  placeInLists,
}: {
  conversationId: string;
  suggestionId: string;
  /**
   * Place la carte d'une todoliste proposée dans « Mes listes », à sa date dans
   * l'ordre du temps. Sans cela, la carte s'affiche seule (autres propositions).
   */
  placeInLists?: (card: ReactNode, dueAt: string | null) => ReactNode;
}) {
  const { pending, resolved, resolve } = useSuggestions(conversationId);
  const pane = useDetailPane();
  const suggestion = [...pending, ...resolved].find((item) => item.id === suggestionId);

  if (!suggestion) {
    return <Text className="text-sm text-muted-foreground">Cette proposition n'existe plus.</Text>;
  }

  if (suggestion.status !== "pending") {
    return <ResolvedSuggestionNote suggestion={suggestion} />;
  }

  const card = (
    <View>
      <SuggestionCard
        flat
        suggestion={suggestion}
        pendingAction={
          resolve.isPending && resolve.variables?.id === suggestion.id
            ? resolve.variables.action
            : null
        }
        onAccept={(input) =>
          resolve.mutate(
            { id: suggestion.id, action: "accept", ...input },
            {
              // Valider une liste ouvre « Mes listes » sur celle qui vient d'être
              // créée : on voit tout de suite ce qu'on retrouvera ensuite.
              onSuccess: (result) => {
                const created = result.taskLists[0];
                if (suggestion.kind === "create_task_list" && created) {
                  pane.open({ kind: "list", listId: created.id });
                }
              },
            },
          )
        }
        onDismiss={() => resolve.mutate({ id: suggestion.id, action: "dismiss" })}
      />
    </View>
  );

  if (suggestion.kind === "create_task_list" && placeInLists) {
    return <>{placeInLists(card, proposedDueAt(suggestion))}</>;
  }
  return card;
}

/** La date de la première liste proposée : c'est elle qui place la carte dans le temps. */
function proposedDueAt(suggestion: Suggestion): string | null {
  const proposed = createTaskListsPayloadSchema.safeParse(suggestion.payload);
  return proposed.success ? (proposed.data.lists[0]?.dueAt ?? null) : null;
}

/**
 * Ce que le fil garde d'une proposition quand le volet de droite existe : le
 * message de l'assistant et un bouton pour la voir. La carte entière, avec ses
 * gestes, est dans le volet.
 */
export function SuggestionPointer({
  suggestion,
  onOpen,
}: {
  suggestion: Suggestion;
  onOpen: () => void;
}) {
  const { palette } = useTheme();

  return (
    <View
      style={[
        styles.pointer,
        { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
      ]}
    >
      <NativeText style={[styles.message, { color: palette.text }]} numberOfLines={3}>
        {suggestion.message}
      </NativeText>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="Voir la proposition de Jean-Claude"
        style={[styles.button, { borderColor: palette.accent }]}
      >
        <NativeText style={[styles.buttonLabel, { color: palette.accent }]}>
          Voir la proposition
        </NativeText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pointer: {
    alignSelf: "flex-start",
    maxWidth: "85%",
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  message: { fontFamily: FONT_FAMILY, fontSize: fontSize.md, lineHeight: 22 },
  button: {
    alignSelf: "flex-start",
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  buttonLabel: { fontFamily: FONT_FAMILY, fontSize: fontSize.md, fontWeight: "600" },
});
