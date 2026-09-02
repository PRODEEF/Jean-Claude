import { View } from "react-native";
import { formatFullDay, formatTime, isSameDay } from "@/shared/lib/dates";
import type { DatedTask } from "@/shared/lib/tasks";
import { Text } from "@/shared/ui/text";
import { TaskRow } from "./TaskRow";
import { momentsOfDay } from "./lib/task-week";

export type WeekBoardProps = {
  /** Les sept jours de la semaine affichée, lundi en tête. */
  days: Date[];
  tasks: DatedTask[];
};

/**
 * Vue hebdomadaire des tâches datées (A.2).
 *
 * Un bloc par jour, découpé en moments — la forme dans laquelle la maquette
 * écrit déjà les journées. Les tâches sans échéance n'y figurent pas : elles se
 * lisent dans « Mes listes », où l'absence de date n'est pas un manque.
 */
export function WeekBoard({ days, tasks }: WeekBoardProps) {
  const today = new Date();

  return (
    <View className="gap-3">
      {days.map((day) => {
        const groups = momentsOfDay(tasks, day);
        const remaining = groups.reduce(
          (count, group) => count + group.tasks.filter(({ task }) => !task.done).length,
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
                <Text className="text-muted-foreground text-xs">
                  {remaining} à faire
                </Text>
              ) : null}
            </View>

            {groups.length === 0 ? (
              <Text className="text-muted-foreground text-sm">Rien de prévu ce jour-là.</Text>
            ) : (
              groups.map((group) => (
                <View key={group.moment.key} className="gap-0.5">
                  <Text className="text-muted-foreground text-[11px] font-medium uppercase">
                    {group.moment.label}
                  </Text>
                  {group.tasks.map(({ task, list }) => (
                    <TaskRow key={task.id} task={task} meta={meta(task.dueAt, list.title)} />
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
 * Contexte affiché sous une tâche de la semaine : son heure, puis sa liste.
 *
 * L'heure n'est reprise que si elle a été posée — minuit signifie « dans la
 * journée », et l'écrire « 0h » ferait croire à une échéance nocturne.
 */
function meta(dueAt: string | null, listTitle: string): string {
  if (dueAt === null) return listTitle;

  const due = new Date(dueAt);
  const timed = due.getHours() !== 0 || due.getMinutes() !== 0;
  return timed ? `${formatTime(dueAt)} · ${listTitle}` : listTitle;
}
