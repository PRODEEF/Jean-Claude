import { View } from "react-native";
import { ListChecks } from "lucide-react-native";
import type { GroupListSuggestion } from "@jc/domain";
import { workspaceErrorMessage } from "@/features/workspace/hooks/use-workspaces";
import { useTheme } from "@/shared/providers/theme-provider";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { useResolveGroupSuggestion } from "./hooks/use-groups";

export type GroupListSuggestionCardProps = {
  suggestion: GroupListSuggestion;
  workspaceId: string;
  /** Nom affiché d'un membre, pour dire qui se charge de quoi. */
  nameOf: (userId: string) => string;
  onOpenList: (listId: string) => void;
};

/**
 * Liste proposée par Jean-Claude, sous son message : l'assistant propose,
 * n'importe quel membre accepte ou ignore d'un geste (§12.1). La décision vaut
 * pour toute la conversation.
 */
export function GroupListSuggestionCard({
  suggestion,
  workspaceId,
  nameOf,
  onOpenList,
}: GroupListSuggestionCardProps) {
  const { palette } = useTheme();
  const { accept, dismiss } = useResolveGroupSuggestion(suggestion.groupId, workspaceId);
  const busy = accept.isPending || dismiss.isPending;
  const error = workspaceErrorMessage(
    accept.error ?? dismiss.error,
    "La réponse n'a pas pu être enregistrée. Réessayez dans un instant.",
  );

  return (
    <View className="mt-1 gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <View className="flex-row items-center gap-2">
        <Icon as={ListChecks} size={16} className="text-muted-foreground" />
        <Text className="flex-1 text-sm font-semibold" numberOfLines={2}>
          {suggestion.title}
        </Text>
      </View>

      <View className="gap-1">
        {suggestion.tasks.map((task, index) => (
          <Text key={`${index}-${task.title}`} className="text-sm">
            • {task.title}
            {task.assigneeId ? (
              <Text className="text-sm text-muted-foreground"> — {nameOf(task.assigneeId)}</Text>
            ) : null}
          </Text>
        ))}
      </View>

      {suggestion.status === "pending" ? (
        <View className="flex-row justify-end gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onPress={() => dismiss.mutate(suggestion.id)}
            accessibilityLabel={`Ignorer la liste proposée « ${suggestion.title} »`}
          >
            <Text>Ignorer</Text>
          </Button>
          <Button
            disabled={busy}
            onPress={() =>
              accept.mutate(suggestion.id, {
                onSuccess: (accepted) => {
                  if (accepted.listId) onOpenList(accepted.listId);
                },
              })
            }
            style={{ backgroundColor: palette.accent }}
            accessibilityLabel={`Créer la liste « ${suggestion.title} » pour l'espace`}
          >
            <Text style={{ color: palette.accentText }}>Créer la liste</Text>
          </Button>
        </View>
      ) : suggestion.status === "accepted" ? (
        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-xs text-muted-foreground">Liste créée pour l'espace.</Text>
          {suggestion.listId ? (
            <Button variant="outline" onPress={() => onOpenList(suggestion.listId ?? "")}>
              <Text>Ouvrir</Text>
            </Button>
          ) : null}
        </View>
      ) : (
        <Text className="text-xs text-muted-foreground">Proposition ignorée.</Text>
      )}

      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}
