import { useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ChevronDown,
  ChevronRight,
  IndentDecrease,
  IndentIncrease,
  UserRound,
  X,
} from "lucide-react-native";
import type { FolderTreeNode, WorkspaceMember, WorkspaceTask, WorkspaceTaskList } from "@jc/domain";
import { dueLabel } from "@/features/todo/ListsBoard";
import { reorderTaskRows, taskDropIndex, useTaskRowDrag } from "@/features/todo/task-row-drag";
import { useWorkspaceFolders } from "@/features/workspace/hooks/use-workspace-folders";
import {
  useWorkspaceMembers,
  workspaceErrorMessage,
} from "@/features/workspace/hooks/use-workspaces";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { cn } from "@/shared/lib/utils";
import { TASK_ROW_HEIGHT } from "@/shared/lib/tasks";
import { useTheme } from "@/shared/providers/theme-provider";
import { Button } from "@/shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import { ContextMenu, type ContextMenuItem } from "@/shared/ui/context-menu";
import { Icon } from "@/shared/ui/icon";
import { GRID_MAX_WIDTH, ScreenShell } from "@/shared/ui/screen-shell";
import {
  TaskListCardBody,
  TaskListCardFrame,
  TaskListCardHeader,
  TaskRowBlankCheckbox,
  TaskRowCheckbox,
  TaskRowGrip,
  taskRowStyle,
} from "@/shared/ui/task-list-card";
import { Text } from "@/shared/ui/text";
import { useWorkspaceList, useWorkspaceListActions } from "./hooks/use-workspace-lists";
import { WorkspaceListDialog, type WorkspaceListTarget } from "./WorkspaceListDialog";

/** Menu ouvert au point du clic : celui de la liste, ou le choix d'un responsable. */
type Menu = { x: number; y: number; items: ContextMenuItem[] };

/**
 * Une liste partagée d'un espace : chacun coche, ajoute, confie une tâche.
 *
 * Elle se présente comme une carte de « Mes listes » — mêmes mesures, même
 * en-tête, mêmes lignes — et se distingue par ce qu'elle ajoute : qui s'en
 * charge. Chaque geste n'écrit que la tâche touchée, là où « Mes listes »
 * réécrit la liste entière : on ne peut pas écraser la saisie d'un autre membre.
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
      maxWidth={GRID_MAX_WIDTH}
      onBack={compact ? () => router.back() : undefined}
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
          onListMenu={(x, y) => setMenu({ x, y, items: listMenu(list.data) })}
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
  onListMenu,
  onMenu,
  closeMenu,
}: {
  list: WorkspaceTaskList;
  workspaceId: string;
  onOpen: (target: WorkspaceListTarget) => void;
  onListMenu: (x: number, y: number) => void;
  onMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  closeMenu: () => void;
}) {
  const members = useWorkspaceMembers(workspaceId);
  const folders = useWorkspaceFolders(workspaceId);
  const { addTask, updateTask, removeTask, reorder } = useWorkspaceListActions(list);
  const compact = useBreakpoint() === "compact";
  const [draft, setDraft] = useState("");
  /** Dépliée par défaut, comme dans « Mes listes » : une liste repliée d'office se ferait oublier. */
  const [open, setOpen] = useState(true);
  /** Où la ligne glissée s'insérerait, `null` hors d'un glisser. */
  const [insertBefore, setInsertBefore] = useState<number | null>(null);
  const names = useMemo(
    () => new Map((members.data ?? []).map((member) => [member.userId, memberName(member)])),
    [members.data],
  );
  const folderName = folderNameOf(folders.data ?? [], list.folderId);
  const due = dueLabel(list);
  const shopping = list.kind === "shopping";

  // Une sous-tâche suit sa tâche : le glisser emporte la famille entière.
  // Truthiness et non `!== null` : une API pas encore déployée ne renvoie pas
  // le champ, et ses tâches sont alors toutes de premier niveau.
  const dragRows = list.tasks.map((task) => ({
    key: task.id,
    depth: task.parentId ? (1 as const) : (0 as const),
  }));
  const hasChildren = (taskId: string) => list.tasks.some((task) => task.parentId === taskId);
  /** La tâche de premier niveau qui précède : celle dont elle deviendrait la sous-tâche. */
  const previousRootOf = (index: number): WorkspaceTask | undefined =>
    list.tasks
      .slice(0, index)
      .reverse()
      .find((task) => !task.parentId);
  const draggable = Platform.OS === "web" && list.tasks.length > 1;

  const dropRow = (sourceKey: string, index: number) => {
    setInsertBefore(null);
    const next = reorderTaskRows(dragRows, sourceKey, index);
    if (next) reorder.mutate(next.map((row) => row.key));
  };

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
    workspaceErrorMessage(removeTask.error, "La tâche n'a pas pu être supprimée.") ??
    workspaceErrorMessage(reorder.error, "L'ordre n'a pas pu être enregistré.");

  return (
    <View className="pb-8">
      <TaskListCardFrame desktop={!compact}>
        <Collapsible open={open} onOpenChange={setOpen}>
          {/* Même en-tête que dans « Mes listes » : flèche de repli et titre,
            puis type, dossier, échéance et menu (demande de Yann, 12 novembre). */}
          <TaskListCardHeader
            title={list.title}
            leading={
              <>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    hitSlop={8}
                    accessibilityLabel={open ? `Replier ${list.title}` : `Déplier ${list.title}`}
                    className="size-8"
                  >
                    <Icon
                      as={open ? ChevronDown : ChevronRight}
                      size={16}
                      className="text-muted-foreground"
                    />
                  </Button>
                </CollapsibleTrigger>

                <Text className="shrink text-sm font-semibold" numberOfLines={1}>
                  {list.title}
                </Text>
              </>
            }
            shopping={shopping}
            folderName={folderName}
            due={due}
            onFolderPress={() => onOpen({ kind: "folder", list })}
            onDuePress={() => onOpen({ kind: "due", list })}
            onMenuPress={(event) => onListMenu(event.nativeEvent.pageX, event.nativeEvent.pageY)}
            menuLabel="Actions pour la liste"
          />

          {/* Même écart sous l'en-tête que dans « Mes listes », et rien entre
            les deux : pas de ligne de décompte, qui ferait la carte plus haute. */}
          <CollapsibleContent>
            <TaskListCardBody desktop={!compact}>
              {list.tasks.map((task, index) => (
                <View key={task.id}>
                  <TaskRow
                    task={task}
                    index={index}
                    listId={list.id}
                    draggable={draggable}
                    marked={insertBefore === index}
                    markedAfter={
                      index === list.tasks.length - 1 && insertBefore === list.tasks.length
                    }
                    resolveDrop={(sourceKey, targetIndex, place) =>
                      taskDropIndex(dragRows, sourceKey, targetIndex, place)
                    }
                    onHover={setInsertBefore}
                    onDrop={dropRow}
                    assignee={
                      task.assigneeId ? (names.get(task.assigneeId) ?? "Ancien membre") : null
                    }
                    onToggle={() =>
                      updateTask.mutate({ taskId: task.id, patch: { done: !task.done } })
                    }
                    onRename={(title) => updateTask.mutate({ taskId: task.id, patch: { title } })}
                    child={Boolean(task.parentId)}
                    onIndent={
                      // Une tâche qui a déjà des sous-tâches ne devient pas une sous-tâche :
                      // un seul niveau.
                      !task.parentId && !hasChildren(task.id) && previousRootOf(index)
                        ? () => {
                            const parent = previousRootOf(index);
                            if (parent)
                              updateTask.mutate({
                                taskId: task.id,
                                patch: { parentId: parent.id },
                              });
                          }
                        : undefined
                    }
                    onOutdent={
                      task.parentId
                        ? () => updateTask.mutate({ taskId: task.id, patch: { parentId: null } })
                        : undefined
                    }
                    onAssign={(x, y) => onMenu(x, y, assigneeMenu(task))}
                    onRemove={() => removeTask.mutate(task.id)}
                  />
                </View>
              ))}

              {/* Même geste que « Mes listes » : la ligne vide d'une liste est
              l'endroit où l'on écrit, une case pâle et le texte « Ajouter une
              tâche » — pas un champ à part suivi d'un bouton. Entrée valide. */}
              <AddTaskRow
                value={draft}
                onChange={setDraft}
                onSubmit={submit}
                disabled={addTask.isPending}
              />
            </TaskListCardBody>
          </CollapsibleContent>
        </Collapsible>
      </TaskListCardFrame>

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
    <View style={{ minHeight: TASK_ROW_HEIGHT }} className="flex-row items-center gap-2">
      <TaskRowBlankCheckbox />
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
  index,
  listId,
  draggable,
  marked,
  markedAfter,
  resolveDrop,
  onHover,
  onDrop,
  assignee,
  onToggle,
  onRename,
  child,
  onIndent,
  onOutdent,
  onAssign,
  onRemove,
}: {
  task: WorkspaceTask;
  index: number;
  listId: string;
  /** Web seulement, et seulement quand il y a de quoi réordonner. */
  draggable: boolean;
  /** Le trait d'insertion s'affiche au-dessus de cette ligne. */
  marked: boolean;
  /** ...ou sous elle, quand la ligne est la dernière. */
  markedAfter: boolean;
  resolveDrop: (sourceKey: string, targetIndex: number, place: "before" | "after") => number | null;
  onHover: (insertBefore: number | null) => void;
  onDrop: (sourceKey: string, insertBefore: number) => void;
  /** Nom du responsable, `null` si personne n'en est chargé. */
  assignee: string | null;
  onToggle: () => void;
  /** Nouveau titre, déjà débarrassé de ses espaces et jamais vide. */
  onRename: (title: string) => void;
  /** Sous-tâche : la ligne est en retrait. */
  child: boolean;
  /** Absent quand la tâche ne peut pas devenir une sous-tâche. */
  onIndent: (() => void) | undefined;
  /** Absent pour une tâche de premier niveau. */
  onOutdent: (() => void) | undefined;
  onAssign: (x: number, y: number) => void;
  onRemove: () => void;
}) {
  const { rowRef, gripRef } = useTaskRowDrag(listId, task.id, draggable, {
    rowIndex: index,
    resolveDrop,
    onHover,
    onDrop,
  });

  const assignButton = (
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
  );

  return (
    <View
      ref={rowRef}
      style={taskRowStyle(child ? 1 : 0)}
      className="group relative flex-row items-center gap-2 rounded-md"
    >
      {marked ? <View className="absolute inset-x-0 top-0 h-0.5 bg-primary" /> : null}
      {markedAfter ? <View className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" /> : null}
      <TaskRowCheckbox done={task.done} label={task.title} onPress={onToggle} />

      <TaskTitle task={task} onRename={onRename} />

      {/* Qui s'en charge reste lisible sur la ligne, comme le jour d'une tâche
          datée dans « Mes listes ». */}
      {assignee ? assignButton : null}

      {/* Les commandes ne s'affichent que sous la souris ou au clavier, comme
          celles de la ligne active de « Mes listes » : à demeure, elles
          feraient de la liste un formulaire. Sur téléphone il n'y a ni survol
          ni clavier : elles restent visibles. */}
      <View
        className={cn(
          "flex-row items-center",
          Platform.select({ web: "hidden group-focus-within:flex group-hover:flex" }),
        )}
      >
        {/* Un appui pour mettre en retrait, ou remonter : le geste des
            téléphones, où la touche Tab n'existe pas. */}
        {onIndent ? (
          <Button
            variant="ghost"
            size="icon"
            onPress={onIndent}
            accessibilityLabel={`Faire de ${task.title} une sous-tâche`}
            className="size-8"
          >
            <Icon as={IndentIncrease} size={14} className="text-muted-foreground" />
          </Button>
        ) : null}
        {onOutdent ? (
          <Button
            variant="ghost"
            size="icon"
            onPress={onOutdent}
            accessibilityLabel={`Remonter ${task.title} d'un niveau`}
            className="size-8"
          >
            <Icon as={IndentDecrease} size={14} className="text-muted-foreground" />
          </Button>
        ) : null}
        {assignee ? null : assignButton}
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

      {/* Derrière la ligne : devant, il ne reste que la case à cocher. */}
      <TaskRowGrip draggable={draggable} gripRef={gripRef} label={`Déplacer ${task.title}`} />
    </View>
  );
}

/**
 * Titre d'une tâche : un appui le rend modifiable sur place, comme dans « Mes
 * listes ». Entrée ou quitter le champ valide ; un titre vide ou inchangé
 * n'écrit rien.
 */
function TaskTitle({ task, onRename }: { task: WorkspaceTask; onRename: (title: string) => void }) {
  const { palette } = useTheme();
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <Pressable
        onPress={() => setDraft(task.title)}
        accessibilityRole="button"
        accessibilityLabel={`Modifier ${task.title}`}
        className="flex-1"
      >
        <Text
          className={cn(
            "text-sm",
            task.done ? "text-muted-foreground line-through" : "text-foreground",
          )}
        >
          {task.title}
        </Text>
      </Pressable>
    );
  }

  const commit = () => {
    const title = draft.trim();
    setDraft(null);
    if (title.length > 0 && title !== task.title) onRename(title);
  };

  return (
    <TextInput
      value={draft}
      onChangeText={setDraft}
      onSubmitEditing={commit}
      onBlur={commit}
      autoFocus
      maxLength={120}
      returnKeyType="done"
      accessibilityLabel={`Titre de la tâche ${task.title}`}
      style={{ fontFamily: FONT_FAMILY, color: palette.text }}
      className={cn("flex-1 text-sm", Platform.select({ web: "outline-none" }))}
    />
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
