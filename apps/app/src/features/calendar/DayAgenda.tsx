import { Pressable, View } from "react-native";
import { ListChecks } from "lucide-react-native";
import type { CalendarEvent, TaskListWithTasks } from "@jc/domain";
import { byDueDate, eventsOfDay, listsOfDay, openTaskCount } from "@jc/domain";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { TaskRow } from "@/features/todo/TaskRow";
import { useFolderChoices } from "@/shared/hooks/use-folder-choices";
import { formatFullDay, formatTime } from "@/shared/lib/dates";
import { groupByFolder } from "@/shared/lib/tasks";

export type DayAgendaProps = {
  day: Date;
  events: CalendarEvent[];
  /** Todolistes échues ce jour-là, listées sous les rendez-vous (A.2). */
  lists: TaskListWithTasks[];
  onOpenEvent: (event: CalendarEvent) => void;
  /** Ouvre le détail de la liste, à la façon de Google Calendar (§4.2). */
  onOpenList: (list: TaskListWithTasks) => void;
};

/**
 * Détail du jour sélectionné, sous la grille mensuelle.
 *
 * C'est ce qui rend la vue mois utilisable sur téléphone : la cellule ne porte
 * qu'une pastille, le contenu se lit ici (§4.2 — Calendrier iOS, Google
 * Calendar).
 */
export function DayAgenda({ day, events, lists, onOpenEvent, onOpenList }: DayAgendaProps) {
  const folders = useFolderChoices();
  const dayEvents = eventsOfDay(events, day);
  const groups = groupByFolder(listsOfDay(lists, day).sort(byDueDate));

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

      {/* Cochable ici : le calendrier dit ce que porte la journée, et rayer
          ce qui est fait ne doit pas obliger à changer d'onglet. L'appui sur
          le titre ouvre le détail complet, comme Google Calendar (§4.2). */}
      {groups.map((group) => (
        <View key={group.folderId ?? "unfiled"} className="gap-2">
          {showFolders ? (
            <Text numberOfLines={1} className="text-muted-foreground text-xs uppercase">
              {folderName(group.folderId)}
            </Text>
          ) : null}

          {group.lists.map((list) => (
            <View
              key={list.id}
              className="border-border gap-0.5 rounded-lg border border-dashed px-3 py-2"
            >
              <Pressable
                onPress={() => onOpenList(list)}
                accessibilityRole="button"
                accessibilityLabel={`Ouvrir la liste ${list.title}`}
                style={{ minHeight: MIN_TOUCH_TARGET }}
                className="flex-row items-center gap-3"
              >
                <Icon as={ListChecks} size={14} className="text-muted-foreground w-14" />
                <View className="flex-1">
                  <Text numberOfLines={1} className="text-sm font-medium">
                    {list.title}
                  </Text>
                  <Text numberOfLines={1} className="text-muted-foreground text-xs">
                    {remainingLabel(openTaskCount(list))}
                  </Text>
                </View>
              </Pressable>
              {list.tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Ce qu'il reste à faire dans une liste échue aujourd'hui. */
export function remainingLabel(remaining: number): string {
  if (remaining === 0) return "Tout est coché";
  return remaining === 1 ? "1 tâche à faire" : `${remaining} tâches à faire`;
}
