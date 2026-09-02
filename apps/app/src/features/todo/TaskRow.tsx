import { Pressable, View } from "react-native";
import { Check, Trash2 } from "lucide-react-native";
import type { Task } from "@jc/domain";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { useTaskActions } from "@/shared/hooks/use-task-lists";

export type TaskRowProps = {
  task: Task;
  /** Contexte de la tâche : sa liste dans la semaine, son échéance dans sa liste. */
  meta?: string;
  /** Ouvre le détail. Absent, l'appui sur le titre coche comme la case. */
  onOpen?: () => void;
  /** Fourni là où la tâche se supprime — pas depuis la semaine, qui n'est qu'une lecture. */
  onRemove?: () => void;
};

/**
 * Une tâche, cochable d'un geste.
 *
 * La case est à gauche et le geste ne demande pas confirmation : c'est ce que
 * font Things 3, Todoist et TickTick (§4.2), où cocher est l'action la plus
 * répétée de la journée. Décocher rétablit l'état précédent, il n'y a donc
 * rien à protéger.
 */
export function TaskRow({ task, meta, onOpen, onRemove }: TaskRowProps) {
  const { updateTask, removeTask } = useTaskActions();

  const toggle = () =>
    updateTask.mutate({ listId: task.listId, taskId: task.id, patch: { done: !task.done } });

  return (
    <View className="flex-row items-center gap-2">
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
        onPress={onOpen ?? toggle}
        accessibilityRole="button"
        accessibilityLabel={onOpen ? `Modifier ${task.title}` : task.title}
        style={{ minHeight: MIN_TOUCH_TARGET }}
        className="flex-1 justify-center py-1"
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

      {onRemove ? (
        <Button
          variant="ghost"
          size="icon"
          hitSlop={8}
          disabled={removeTask.isPending}
          onPress={onRemove}
          accessibilityLabel={`Supprimer ${task.title}`}
          className="size-8"
        >
          <Icon as={Trash2} size={14} className="text-muted-foreground" />
        </Button>
      ) : null}
    </View>
  );
}
