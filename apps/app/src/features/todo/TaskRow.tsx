import { Pressable, View } from "react-native";
import { Check } from "lucide-react-native";
import type { Task } from "@jc/domain";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { useTaskActions } from "@/shared/hooks/use-task-lists";

/** Retrait d'une sous-tâche, aligné sur celui de l'éditeur. */
const INDENT = 22;

export type TaskRowProps = {
  task: Task;
  /** Contexte de la tâche, quand la rangée est lue hors de sa liste. */
  meta?: string;
};

/**
 * Une tâche cochable, en lecture.
 *
 * Sert là où la tâche est vue depuis ailleurs que sa liste — la semaine. Dans
 * sa liste, c'est `TaskListEditor` qui la porte : on y écrit autant qu'on y
 * coche.
 *
 * La case est à gauche et le geste ne demande pas confirmation : c'est ce que
 * font Things 3, Todoist et TickTick (§4.2), où cocher est l'action la plus
 * répétée de la journée. Décocher rétablit l'état précédent, il n'y a donc
 * rien à protéger.
 */
export function TaskRow({ task, meta }: TaskRowProps) {
  const { updateTask } = useTaskActions();

  const toggle = () =>
    updateTask.mutate({ listId: task.listId, taskId: task.id, patch: { done: !task.done } });

  return (
    <View
      className="flex-row items-center gap-2"
      style={{ paddingLeft: task.parentId === null ? 0 : INDENT }}
    >
      <Pressable
        onPress={toggle}
        disabled={updateTask.isPending}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.done }}
        accessibilityLabel={task.done ? `Décocher ${task.title}` : `Cocher ${task.title}`}
        hitSlop={8}
        style={{ minWidth: MIN_TOUCH_TARGET / 2, minHeight: MIN_TOUCH_TARGET }}
        className="items-center justify-center"
      >
        <View
          className={`size-5 items-center justify-center rounded border ${
            task.done ? "border-primary bg-primary" : "border-border"
          }`}
        >
          {task.done ? <Icon as={Check} size={14} className="text-primary-foreground" /> : null}
        </View>
      </Pressable>

      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={task.title}
        style={{ minHeight: MIN_TOUCH_TARGET }}
        className="flex-1 justify-center"
      >
        <Text
          numberOfLines={2}
          className={`text-sm ${
            task.done ? "text-muted-foreground line-through" : "text-foreground"
          }`}
        >
          {task.title}
        </Text>
        {meta ? <Text className="text-muted-foreground text-xs">{meta}</Text> : null}
      </Pressable>
    </View>
  );
}
