import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { ListChecks } from "lucide-react-native";
import type { CalendarEvent } from "@jc/domain";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { useFolderChoices } from "@/shared/hooks/use-folder-choices";
import { eventsOfDay } from "./lib/calendar-dates";
import { formatFullDay, formatTime } from "@/shared/lib/dates";
import { openTasksOfDay, byDueDate, groupByFolder, type DatedTask } from "@/shared/lib/tasks";

export type DayAgendaProps = {
  day: Date;
  events: CalendarEvent[];
  /** Tâches datées à faire ce jour-là, listées sous les rendez-vous (A.2). */
  tasks: DatedTask[];
  onOpenEvent: (event: CalendarEvent) => void;
};

/**
 * Détail du jour sélectionné, sous la grille mensuelle.
 *
 * C'est ce qui rend la vue mois utilisable sur téléphone : la cellule ne porte
 * qu'une pastille, le contenu se lit ici (§4.2 — Calendrier iOS, Google
 * Calendar).
 */
export function DayAgenda({ day, events, tasks, onOpenEvent }: DayAgendaProps) {
  const router = useRouter();
  const folders = useFolderChoices();
  const dayEvents = eventsOfDay(events, day);
  const groups = groupByFolder(openTasksOfDay(tasks, day).sort(byDueDate));

  // Un seul groupe se passe d'intitulé : sans dossier, ou tout dans le même,
  // l'en-tête ne distinguerait rien de ce qui est déjà sous les yeux.
  const showFolders = groups.length > 1;

  // Le chemin complet plutôt que le seul nom : deux « Assurances » rangées sous
  // deux parents différents seraient indiscernables. Le repli couvre aussi le
  // dossier supprimé dont le cache des listes n'a pas encore connaissance.
  const folderName = (folderId: string | null): string =>
    folderId === null
      ? "Sans dossier"
      : (folders.find((folder) => folder.id === folderId)?.name ?? "Sans dossier");

  return (
    <View className="gap-2">
      <Text className="text-muted-foreground text-xs uppercase">{formatFullDay(day)}</Text>

      {dayEvents.length === 0 && groups.length === 0 ? (
        <Text className="text-muted-foreground text-sm">Rien de prévu ce jour-là.</Text>
      ) : (
        dayEvents.map((event) => (
          <Pressable
            key={event.id}
            onPress={() => onOpenEvent(event)}
            accessibilityRole="button"
            accessibilityLabel={`Modifier ${event.title}`}
            style={{ minHeight: MIN_TOUCH_TARGET }}
            className="border-border flex-row items-center gap-3 rounded-lg border px-3 py-2"
          >
            <Text className="text-muted-foreground w-14 text-xs">
              {event.allDay ? "journée" : formatTime(event.startsAt)}
            </Text>
            <View className="flex-1">
              <Text numberOfLines={1} className="text-sm font-medium">
                {event.title}
              </Text>
              {event.notes ? (
                <Text numberOfLines={1} className="text-muted-foreground text-xs">
                  {event.notes}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))
      )}

      {/* Les tâches se cochent dans l'onglet Todoliste, pas ici : le calendrier
          dit ce que porte la journée, il n'est pas un second endroit où gérer
          les mêmes listes. L'appui y conduit, sur la liste concernée.
          Regroupées par dossier, parce qu'une journée mélange le jardin et les
          impôts : l'intitulé dit de quoi relève ce qui suit. */}
      {groups.map((group) => (
        <View key={group.folderId ?? "unfiled"} className="gap-2">
          {showFolders ? (
            <Text numberOfLines={1} className="text-muted-foreground text-xs uppercase">
              {folderName(group.folderId)}
            </Text>
          ) : null}

          {group.tasks.map(({ task, list }) => (
            <Pressable
              key={task.id}
              onPress={() => router.push(`/todo?list=${list.id}` as never)}
              accessibilityRole="button"
              accessibilityLabel={`Ouvrir ${task.title} dans ${list.title}`}
              style={{ minHeight: MIN_TOUCH_TARGET }}
              className="border-border flex-row items-center gap-3 rounded-lg border border-dashed px-3 py-2"
            >
              <Icon as={ListChecks} size={14} className="text-muted-foreground w-14" />
              <View className="flex-1">
                <Text numberOfLines={1} className="text-sm font-medium">
                  {task.title}
                </Text>
                <Text numberOfLines={1} className="text-muted-foreground text-xs">
                  {list.title}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}
