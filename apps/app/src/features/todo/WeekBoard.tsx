import { View } from "react-native";
import { ListChecks, ShoppingBasket } from "lucide-react-native";
import type { TaskListWithTasks } from "@jc/domain";
import { formatFullDay, formatTime, isSameDay } from "@/shared/lib/dates";
import { openTaskCount } from "@/shared/lib/tasks";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { TaskRow } from "./TaskRow";
import { momentsOfDay } from "./lib/task-week";

export type WeekBoardProps = {
  /** Les sept jours de la semaine affichée, lundi en tête. */
  days: Date[];
  lists: TaskListWithTasks[];
};

/**
 * Vue hebdomadaire des todolistes échues (A.2).
 *
 * Un bloc par jour, découpé en moments — la forme dans laquelle la maquette
 * écrit déjà les journées. L'échéance appartient à la liste : c'est donc la
 * liste entière qui se pose sur son jour, avec ce qu'elle contient. Les listes
 * sans échéance n'y figurent pas — elles se lisent dans « Mes listes », où
 * l'absence de date n'est pas un manque.
 */
export function WeekBoard({ days, lists }: WeekBoardProps) {
  const today = new Date();

  return (
    <View className="gap-3">
      {days.map((day) => {
        const groups = momentsOfDay(lists, day);
        const remaining = groups.reduce(
          (count, group) => count + group.lists.reduce((sum, list) => sum + openTaskCount(list), 0),
          0,
        );
        const isToday = isSameDay(day, today);

        return (
          <View
            key={day.toISOString()}
            className={`gap-2 rounded-xl border p-3 ${
              isToday ? "border-primary" : "border-border"
            }`}
          >
            <View className="flex-row items-center justify-between gap-2">
              <Text
                className={`text-xs font-semibold uppercase ${
                  isToday ? "text-primary" : "text-foreground"
                }`}
              >
                {formatFullDay(day)}
              </Text>
              {remaining > 0 ? (
                <Text className="text-muted-foreground text-xs">{remaining} à faire</Text>
              ) : null}
            </View>

            {groups.length === 0 ? (
              <Text className="text-muted-foreground text-sm">Rien de prévu ce jour-là.</Text>
            ) : (
              groups.map((group) => (
                <View key={group.moment.key} className="gap-2">
                  <Text className="text-muted-foreground text-[11px] font-medium uppercase">
                    {group.moment.label}
                  </Text>
                  {group.lists.map((list) => (
                    <DueList key={list.id} list={list} />
                  ))}
                </View>
              ))
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Une liste échue ce jour-là, avec ce qu'elle contient.
 *
 * Le contenu est montré et non résumé : « Courses » sans ses lignes n'apprend
 * rien de ce qu'il reste à faire, et c'est précisément ce que la semaine sert
 * à lire. Les lignes s'y cochent — l'écriture, elle, reste dans « Mes listes ».
 */
function DueList({ list }: { list: TaskListWithTasks }) {
  const shopping = list.kind === "shopping";

  return (
    <View className="border-border gap-0.5 rounded-lg border border-dashed p-2">
      <View className="flex-row items-center gap-2">
        <Icon
          as={shopping ? ShoppingBasket : ListChecks}
          size={14}
          className="text-muted-foreground"
        />
        <Text className="flex-1 text-sm font-medium" numberOfLines={1}>
          {list.title}
        </Text>
        {timeLabel(list.dueAt) ? (
          <Text className="text-muted-foreground text-xs">{timeLabel(list.dueAt)}</Text>
        ) : null}
      </View>

      {list.tasks.length === 0 ? (
        <Text className="text-muted-foreground text-xs">Liste vide.</Text>
      ) : (
        list.tasks.map((task) => <TaskRow key={task.id} task={task} />)
      )}
    </View>
  );
}

/**
 * Heure de l'échéance, quand elle en porte une.
 *
 * Minuit signifie « dans la journée » — c'est déjà ce que dit l'intitulé du
 * moment — et l'écrire « 0h » ferait croire à une échéance nocturne.
 */
function timeLabel(dueAt: string | null): string | undefined {
  if (dueAt === null) return undefined;
  const due = new Date(dueAt);
  return due.getHours() === 0 && due.getMinutes() === 0 ? undefined : formatTime(dueAt);
}
