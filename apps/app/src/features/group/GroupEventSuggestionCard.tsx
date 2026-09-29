import { View } from "react-native";
import { CalendarPlus } from "lucide-react-native";
import type { GroupEventSuggestion } from "@jc/domain";
import { workspaceErrorMessage } from "@/features/workspace/hooks/use-workspaces";
import { formatFullDay, formatTime } from "@/shared/lib/dates";
import { useTheme } from "@/shared/providers/theme-provider";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { useResolveGroupEventSuggestion } from "./hooks/use-groups";

/**
 * Événement proposé par Jean-Claude, sous son message : n'importe quel membre
 * l'ajoute au calendrier de tous ou l'ignore, d'un geste (§12.1). Même carte
 * que la liste proposée (`GroupListSuggestionCard`).
 */
export function GroupEventSuggestionCard({ suggestion }: { suggestion: GroupEventSuggestion }) {
  const { palette } = useTheme();
  const { accept, dismiss } = useResolveGroupEventSuggestion(suggestion.groupId);
  const busy = accept.isPending || dismiss.isPending;
  const error = workspaceErrorMessage(
    accept.error ?? dismiss.error,
    "La réponse n'a pas pu être enregistrée. Réessayez dans un instant.",
  );

  return (
    <View className="mt-1 gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <View className="flex-row items-center gap-2">
        <Icon as={CalendarPlus} size={16} className="text-muted-foreground" />
        <Text className="flex-1 text-sm font-semibold" numberOfLines={2}>
          {suggestion.title}
        </Text>
      </View>

      <View className="gap-1">
        <Text className="text-sm">{describeWhen(suggestion)}</Text>
        {suggestion.notes ? (
          <Text className="text-sm text-muted-foreground">{suggestion.notes}</Text>
        ) : null}
      </View>

      {suggestion.status === "pending" ? (
        <View className="flex-row justify-end gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onPress={() => dismiss.mutate(suggestion.id)}
            accessibilityLabel={`Ignorer l'événement proposé « ${suggestion.title} »`}
          >
            <Text>Ignorer</Text>
          </Button>
          <Button
            disabled={busy}
            onPress={() => accept.mutate(suggestion.id)}
            style={{ backgroundColor: palette.accent }}
            accessibilityLabel={`Ajouter « ${suggestion.title} » au calendrier des membres`}
          >
            <Text style={{ color: palette.accentText }}>Ajouter au calendrier</Text>
          </Button>
        </View>
      ) : (
        <Text className="text-xs text-muted-foreground">
          {suggestion.status === "accepted"
            ? "Ajouté au calendrier des membres de la conversation."
            : "Proposition ignorée."}
        </Text>
      )}

      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}

/** Même lecture que la fiche d'un événement du calendrier. */
function describeWhen(suggestion: GroupEventSuggestion): string {
  const day = formatFullDay(new Date(suggestion.startsAt));
  if (suggestion.allDay) return `${day} · journée entière`;
  const end = suggestion.endsAt ? `–${formatTime(suggestion.endsAt)}` : "";
  return `${day} · ${formatTime(suggestion.startsAt)}${end}`;
}
