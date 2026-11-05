import { useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  CalendarClock,
  Check,
  Folder,
  ListChecks,
  MoreHorizontal,
  ShoppingBasket,
  UserRound,
  X,
} from "lucide-react-native";
import type { FolderTreeNode, WorkspaceMember, WorkspaceTask, WorkspaceTaskList } from "@jc/domain";
import { dueLabel } from "@/features/todo/ListsBoard";
import { useWorkspaceFolders } from "@/features/workspace/hooks/use-workspace-folders";
import {
  useWorkspaceMembers,
  workspaceErrorMessage,
} from "@/features/workspace/hooks/use-workspaces";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { cn } from "@/shared/lib/utils";
import { useTheme } from "@/shared/providers/theme-provider";
import { Button } from "@/shared/ui/button";
import { ContextMenu, type ContextMenuItem } from "@/shared/ui/context-menu";
import { Icon } from "@/shared/ui/icon";
import { READING_MAX_WIDTH, ScreenShell } from "@/shared/ui/screen-shell";
import { Separator } from "@/shared/ui/separator";
import { Text } from "@/shared/ui/text";
import { useWorkspaceList, useWorkspaceListActions } from "./hooks/use-workspace-lists";
import { WorkspaceListDialog, type WorkspaceListTarget } from "./WorkspaceListDialog";

/** Menu ouvert au point du clic : celui de la liste, ou le choix d'un responsable. */
type Menu = { x: number; y: number; items: ContextMenuItem[] };

/**
 * Une liste partagée d'un espace : chacun coche, ajoute, confie une tâche.
 *
 * Plus simple qu'une todoliste personnelle — ni échéance ni sous-tâche — et
 * chaque geste n'écrit que la tâche touchée.
 */
export function WorkspaceListScreen() {
  const { id: workspaceId, listId } = useLocalSearchParams<{ id: string; listId: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const compact = useBreakpoint() === "compact";
  const list = useWorkspaceList(listId);
  const [dialog, setDialog] = useState<WorkspaceListTarget | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);

  const listMenu = (data: WorkspaceTaskList): ContextMenuItem[] => [
    { label: "Renommer", onPress: () => open({ kind: "rename", list: data }) },
    { label: "Ranger dans un dossier", onPress: () => open({ kind: "folder", list: data }) },
    {
      label: "Supprimer la liste",
      destructive: true,
      onPress: () => open({ kind: "delete", list: data }),
    },
  ];

  function open(target: WorkspaceListTarget) {
    setMenu(null);
    setDialog(target);
  }

  return (
    <ScreenShell
      title={list.data?.title ?? ""}
      maxWidth={READING_MAX_WIDTH}
      onBack={compact ? () => router.back() : undefined}
      action={
        list.data ? (
          <Button
            variant="ghost"
            size="icon"
            onPress={(event) =>
              setMenu({
                x: event.nativeEvent.pageX,
                y: event.nativeEvent.pageY,
                items: listMenu(list.data),
              })
            }
            accessibilityLabel="Actions pour la liste"
          >
            <Icon as={MoreHorizontal} size={18} className="text-muted-foreground" />
          </Button>
        ) : undefined
      }
    >
      {list.isLoading ? <ActivityIndicator color={palette.accent} /> : null}
      {list.error ? (
        <Text className="text-sm text-muted-foreground">
          Cette liste est introuvable, ou vous ne faites plus partie de son espace.
        </Text>
      ) : null}
      {list.data ? (
        <ListBody
          list={list.data}
          workspaceId={workspaceId}
          onOpen={open}
          onMenu={(x, y, items) => setMenu({ x, y, items })}
          closeMenu={() => setMenu(null)}
        />
      ) : null}

      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      ) : null}

      <WorkspaceListDialog
        target={dialog}
        onClose={() => setDialog(null)}
        onDone={(done) => {
          if (done === null) router.replace(`/workspace/${workspaceId}`);
        }}
      />
    </ScreenShell>
  );
}

function ListBody({
  list,
  workspaceId,
  onOpen,
  onMenu,
  closeMenu,
}: {
  list: WorkspaceTaskList;
  workspaceId: string;
  onOpen: (target: WorkspaceListTarget) => void;
  onMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  closeMenu: () => void;
}) {
  const members = useWorkspaceMembers(workspaceId);
  const folders = useWorkspaceFolders(workspaceId);
  const { addTask, updateTask, removeTask } = useWorkspaceListActions(list);
  const [draft, setDraft] = useState("");
  const names = useMemo(
    () => new Map((members.data ?? []).map((member) => [member.userId, memberName(member)])),
    [members.data],
  );
  const done = list.tasks.filter((task) => task.done).length;
  const folderName = folderNameOf(folders.data ?? [], list.folderId);
  const due = dueLabel(list);
  const shopping = list.kind === "shopping";

  const submit = () => {
    const title = draft.trim();
    if (!title || addTask.isPending) return;
    addTask.mutate({ title }, { onSuccess: () => setDraft("") });
  };

  const assigneeMenu = (task: WorkspaceTask): ContextMenuItem[] => [
    ...(members.data ?? []).map((member) => ({
      label: memberName(member),
      onPress: () => {
        closeMenu();
        updateTask.mutate({ taskId: task.id, patch: { assigneeId: member.userId } });
      },
    })),
    {
      label: "Personne en particulier",
      onPress: () => {
        closeMenu();
        updateTask.mutate({ taskId: task.id, patch: { assigneeId: null } });
      },
    },
  ];

  const error =
    workspaceErrorMessage(addTask.error, "La tâche n'a pas pu être ajoutée.") ??
    workspaceErrorMessage(updateTask.error, "La modification n'a pas pu être enregistrée.") ??
    workspaceErrorMessage(removeTask.error, "La tâche n'a pas pu être supprimée.");

  return (
    <View className="gap-4 pb-8">
      {/* Même ligne que l'en-tête d'une liste de « Mes listes » : le type, le
          dossier, puis l'échéance, qui se changent d'un appui. */}
      <View className="gap-1">
        <View className="flex-row items-center gap-2">
          <Icon
            as={shopping ? ShoppingBasket : ListChecks}
            size={16}
            className="text-muted-foreground"
          />
          <Text className="shrink text-xs text-muted-foreground" numberOfLines={1}>
            {shopping ? "Liste d'achats" : "Liste de tâches"}
          </Text>

          <Pressable
            onPress={() => onOpen({ kind: "folder", list })}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Dossier de ${list.title} : ${folderName ?? "aucun"}`}
            className="min-w-0 shrink flex-row items-center gap-1 rounded-md px-1.5 py-1"
          >
            <Icon as={Folder} size={14} className="text-muted-foreground" />
            <Text className="shrink text-xs text-muted-foreground" numberOfLines={1}>
              {folderName ?? "Dossier"}
            </Text>
          </Pressable>

          <View className="min-w-0 flex-1" />

          <Pressable
            onPress={() => onOpen({ kind: "due", list })}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Échéance de ${list.title} : ${due ?? "aucune"}`}
            className="shrink-0 flex-row items-center gap-1 rounded-md px-1.5 py-1"
          >
            <Icon as={CalendarClock} size={14} className="text-muted-foreground" />
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {due ?? "Date"}
            </Text>
          </Pressable>
        </View>

        <Text className="text-sm text-muted-foreground">
          {list.tasks.length === 0
            ? "Aucune tâche pour l'instant."
            : `${done} sur ${list.tasks.length} faite${done > 1 ? "s" : ""}`}
        </Text>
      </View>

      <View className="overflow-hidden rounded-xl border border-border bg-card">
        {list.tasks.map((task, index) => (
          <View key={task.id}>
            {index > 0 ? <Separator /> : null}
            <TaskRow
              task={task}
              assignee={task.assigneeId ? (names.get(task.assigneeId) ?? "Ancien membre") : null}
              onToggle={() => updateTask.mutate({ taskId: task.id, patch: { done: !task.done } })}
              onAssign={(x, y) => onMenu(x, y, assigneeMenu(task))}
              onRemove={() => removeTask.mutate(task.id)}
            />
          </View>
        ))}

        {/* Même geste que « Mes listes » : la ligne vide d'une liste est
              l'endroit où l'on écrit, une case pâle et le texte « Ajouter une
              tâche » — pas un champ à part suivi d'un bouton. Entrée valide. */}
        {list.tasks.length > 0 ? <Separator /> : null}
        <AddTaskRow
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          disabled={addTask.isPending}
        />
      </View>

      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
    </View>
  );
}

function AddTaskRow({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const { palette } = useTheme();

  return (
    <View className="min-h-14 flex-row items-center gap-3 px-3 py-2">
      <View className="size-11 items-center justify-center">
        <View className="size-5 rounded border border-border opacity-40" />
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        submitBehavior="submit"
        editable={!disabled}
        placeholder="Ajouter une tâche"
        placeholderTextColor={palette.textMuted}
        maxLength={120}
        returnKeyType="done"
        accessibilityLabel="Nouvelle tâche"
        style={{ fontFamily: FONT_FAMILY, color: palette.text }}
        className={cn("flex-1 text-sm", Platform.select({ web: "outline-none" }))}
      />
    </View>
  );
}

function TaskRow({
  task,
  assignee,
  onToggle,
  onAssign,
  onRemove,
}: {
  task: WorkspaceTask;
  /** Nom du responsable, `null` si personne n'en est chargé. */
  assignee: string | null;
  onToggle: () => void;
  onAssign: (x: number, y: number) => void;
  onRemove: () => void;
}) {
  return (
    <View className="min-h-14 flex-row items-center gap-3 px-3 py-2">
      <Pressable
        onPress={onToggle}
        role="checkbox"
        accessibilityState={{ checked: task.done }}
        accessibilityLabel={task.title}
        hitSlop={8}
        className="size-11 items-center justify-center"
      >
        <View
          className={cn(
            "size-5 items-center justify-center rounded border",
            task.done ? "border-primary bg-primary" : "border-border",
          )}
        >
          {task.done ? <Icon as={Check} size={14} className="text-primary-foreground" /> : null}
        </View>
      </Pressable>

      <Text
        className={cn(
          "flex-1 text-sm",
          task.done ? "text-muted-foreground line-through" : "text-foreground",
        )}
      >
        {task.title}
      </Text>

      {/* Qui s'en charge : un appui pour confier la tâche à un autre membre. */}
      <Button
        variant="ghost"
        onPress={(event) => onAssign(event.nativeEvent.pageX, event.nativeEvent.pageY)}
        accessibilityLabel={
          assignee ? `Confiée à ${assignee}. Changer de responsable` : "Confier la tâche"
        }
        className="h-8 gap-1.5 px-2"
      >
        <Icon as={UserRound} size={14} className="text-muted-foreground" />
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {assignee ?? "Confier"}
        </Text>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onPress={onRemove}
        accessibilityLabel={`Supprimer la tâche ${task.title}`}
        className="size-8"
      >
        <Icon as={X} size={14} className="text-muted-foreground" />
      </Button>
    </View>
  );
}

function memberName(member: WorkspaceMember): string {
  return member.displayName ?? member.email ?? "Ancien membre";
}

/** Nom du dossier d'une liste, cherché dans l'arborescence de l'espace. */
function folderNameOf(nodes: FolderTreeNode[], folderId: string | null): string | undefined {
  if (folderId === null) return undefined;

  for (const node of nodes) {
    if (node.id === folderId) return node.name;
    const inChild = folderNameOf(node.children, folderId);
    if (inChild !== undefined) return inChild;
  }
  return undefined;
}
