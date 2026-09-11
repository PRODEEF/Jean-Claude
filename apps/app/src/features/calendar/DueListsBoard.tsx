import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { ListChecks, ShoppingBasket } from "lucide-react-native";
import type { TaskListWithTasks } from "@jc/domain";
import { momentsOfDay, openTaskCount } from "@jc/domain";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { formatFullDay, formatTime, isSameDay } from "@/shared/lib/dates";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { TaskRow } from "@/features/todo/TaskRow";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";

export type DueListsBoardProps = {
  /** Les jours à afficher, dans l'ordre — une semaine ou un mois selon l'appelant. */
  days: Date[];
  lists: TaskListWithTasks[];
};

/**
 * Todolistes échues, un bloc par jour découpé en moments (A.2).
 *
 * Cochable directement : le calendrier dit ce que porte chaque jour, et rayer
 * ce qui est fait ne doit pas obliger à changer d'onglet. Seul le titre de la
 * liste conduit vers Mes listes, pour l'édition complète — renommer, ajouter
 * une tâche.
 */
export function DueListsBoard({ days, lists }: DueListsBoardProps) {
  const today = new Date();
  // Resserré sur grand écran seulement : un mois entier de listes tient mal
  // sur téléphone où l'espace généreux protège du doigt, mais gagne à se
  // resserrer sur un écran large où plusieurs semaines sont visibles à la fois.
  const desktop = useBreakpoint() === "expanded";

  return (
    <View className={desktop ? "gap-2" : "gap-3"}>
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
            className={`gap-2 rounded-xl border ${desktop ? "p-2" : "p-3"} ${
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
                <View key={group.moment.key} className={desktop ? "gap-1" : "gap-2"}>
                  <Text className="text-muted-foreground text-[11px] font-medium uppercase">
                    {group.moment.label}
                  </Text>
                  {group.lists.map((list) => (
                    <DueList key={list.id} list={list} desktop={desktop} />
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
 * rien de ce qu'il reste à faire. Seul l'en-tête (icône, titre, heure) ouvre
 * la liste dans Mes listes — les tâches elles-mêmes se cochent ici, via
 * `TaskRow`, sans changer d'onglet.
 */
function DueList({ list, desktop }: { list: TaskListWithTasks; desktop: boolean }) {
  const router = useRouter();
  const shopping = list.kind === "shopping";

  return (
    <View
      className={`border-border gap-0.5 rounded-lg border border-dashed ${desktop ? "p-1.5" : "p-2"}`}
    >
      <Pressable
        onPress={() => router.push(`/todo?list=${list.id}` as never)}
        accessibilityRole="button"
        accessibilityLabel={`Ouvrir la liste ${list.title}`}
        style={{ minHeight: MIN_TOUCH_TARGET }}
        className="flex-row items-center gap-2"
      >
        <Icon
          as={shopping ? ShoppingBasket : ListChecks}
          size={14}
          className="text-muted-foreground"
        />
        <Text className="flex-1 text-sm font-medium" numberOfLines={1}>
          {list.title}
        </Text>
        {timeLabel(list) ? (
          <Text className="text-muted-foreground text-xs">{timeLabel(list)}</Text>
        ) : null}
      </Pressable>

      {list.tasks.length === 0 ? (
        <Text className="text-muted-foreground text-xs">Liste vide.</Text>
      ) : (
        list.tasks.map((task) => <TaskRow key={task.id} task={task} />)
      )}
    </View>
  );
}

/**
 * Heure de l'échéance, quand elle en vise une.
 *
 * Une échéance « dans la journée » n'en affiche pas — c'est déjà ce que dit
 * l'intitulé du moment, et l'écrire « 0h » ferait croire à une échéance
 * nocturne.
 */
function timeLabel(list: TaskListWithTasks): string | undefined {
  if (list.dueAt === null || list.dueAllDay !== false) return undefined;
  return formatTime(list.dueAt);
}
