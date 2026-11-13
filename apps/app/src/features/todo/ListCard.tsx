import { useEffect, useRef, useState, type Ref, type RefObject } from "react";
import { ScrollView, View } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { isListDone, type Task, type TaskList, type TaskListWithTasks } from "@jc/domain";
import { Button } from "@/shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import { ContextMenu, type ContextMenuItem } from "@/shared/ui/context-menu";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import {
  TaskListCardBody,
  TaskListCardFrame,
  TaskListCardHeader,
  TaskRowCheckbox,
  TaskRowGrip,
} from "@/shared/ui/task-list-card";
import { formatFullDay, formatTime } from "@/shared/lib/dates";
import type { FolderChoice } from "@/shared/hooks/use-folder-choices";
import { useTaskActions } from "@/shared/hooks/use-task-lists";
import { ListDueDialog } from "./ListDueDialog";
import { TaskListEditor } from "./TaskListEditor";

/**
 * La carte d'une liste, la même partout : « Mes listes », le volet de droite.
 *
 * Elle porte l'en-tête (type, dossier, échéance, menu), le repli et l'éditeur
 * de tâches. Elle vivait dans « Mes listes » ; la sortir d'un seul écran est ce
 * qui fait que les autres ne la recopient pas, et que l'une ne dérive pas de
 * l'autre (demande de Yann, 11 novembre).
 */

/**
 * Ordre donné à toutes les cartes d'un coup : replier ou déplier.
 *
 * `version` change à chaque ordre, même répété : sans lui, replier deux fois de
 * suite après avoir rouvert une carte à la main ne ferait rien la seconde fois.
 */
export type FoldCommand = { open: boolean; version: number };

/** Marge laissée au-dessus de la carte mise en avant, pour ne pas la coller au bandeau. */
const HIGHLIGHT_SCROLL_MARGIN = 16;

export function ListCard({
  list,
  folders,
  highlighted = false,
  landing = false,
  desktop,
  scrollRef,
  query,
  fold,
  visibleTaskIds,
  dueOnForNew,
  gripRef,
  onEdit,
  onDelete,
  onOpenTask,
}: {
  list: TaskListWithTasks;
  folders: FolderChoice[];
  highlighted?: boolean;
  landing?: boolean;
  desktop: boolean;
  scrollRef?: RefObject<ScrollView | null>;
  query: string;
  fold?: FoldCommand;
  /** Tâches montrées, quand la carte n'est là que pour le jour de certaines d'entre elles. */
  visibleTaskIds?: readonly string[];
  /** Jour des lignes nouvelles, quand on écrit depuis un autre jour que l'échéance de la liste. */
  dueOnForNew?: string;
  /** Poignée pour déplacer la liste (web) : absente, la carte ne se déplace pas. */
  gripRef?: Ref<View>;
  onEdit: () => void;
  onDelete: () => void;
  onOpenTask: (task: Task) => void;
}) {
  /** Dépliée par défaut : une liste repliée d'office se ferait oublier. */
  const [open, setOpen] = useState(true);

  // Suit l'ordre global, y compris pour une carte apparue après lui (filtre,
  // nouvelle liste) : elle se range avec les autres.
  useEffect(() => {
    if (fold) setOpen(fold.open);
  }, [fold]);
  /** Point d'ouverture du menu, `null` s'il est fermé. */
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  /** Point d'ouverture du choix de dossier, `null` s'il est fermé. */
  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number } | null>(null);
  const [editingDue, setEditingDue] = useState(false);
  const { updateList, updateTask } = useTaskActions();
  const card = useRef<View>(null);

  // Amène la carte visée depuis la barre latérale à l'écran : la mettre en
  // avant ne suffit pas quand « Mes listes » en compte assez pour déborder
  // l'écran, la carte reste alors hors champ malgré sa bordure.
  // La liste du moment est amenée à l'écran de la même façon, une seule fois
  // (`landing` ne change plus après l'arrivée).
  const scrollTarget = highlighted || landing;
  useEffect(() => {
    if (!scrollTarget || !scrollRef) return;

    const frame = requestAnimationFrame(() => {
      const scrollNode = scrollRef.current?.getNativeScrollRef();
      if (!scrollNode) return;

      // Mesurée relativement au défilement lui-même plutôt qu'à l'écran : la
      // carte peut être imbriquée sous n'importe quel nombre de vues
      // intermédiaires, `measureLayout` s'en affranchit.
      card.current?.measureLayout(scrollNode, (_x, y) => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, y - HIGHLIGHT_SCROLL_MARGIN),
          animated: true,
        });
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [scrollTarget, scrollRef]);

  const allDone = isListDone(list);

  // Cocher la liste coche ses tâches, la décocher les décoche : la liste n'a
  // pas d'état à elle, elle se lit dans ses tâches (aucune colonne en base).
  const toggleAll = () => {
    const done = !allDone;
    for (const task of list.tasks) {
      if (task.done !== done)
        updateTask.mutate({ listId: list.id, taskId: task.id, patch: { done } });
    }
  };

  const shopping = list.kind === "shopping";
  const due = dueLabel(list);
  const folderName = folders.find((folder) => folder.id === list.folderId)?.name;

  const chooseFolder = (folderId: string | null) => {
    setFolderMenu(null);
    if (folderId !== list.folderId) updateList.mutate({ id: list.id, patch: { folderId } });
  };

  const folderItems: ContextMenuItem[] = [
    { label: "Aucun dossier", onPress: () => chooseFolder(null) },
    ...folders.map((folder) => ({ label: folder.name, onPress: () => chooseFolder(folder.id) })),
  ];

  const items: ContextMenuItem[] = [
    {
      label: "Modifier la liste",
      onPress: () => {
        setMenu(null);
        onEdit();
      },
    },
    {
      label: "Supprimer la liste",
      destructive: true,
      onPress: () => {
        setMenu(null);
        onDelete();
      },
    },
  ];

  return (
    <TaskListCardFrame cardRef={card} desktop={desktop} highlighted={highlighted}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <TaskListCardHeader
          title={list.title}
          shopping={shopping}
          folderName={folderName}
          due={due}
          // Le dossier se change ici parce que la liste s'y voit aussi (A.2) :
          // c'est la même liste, pas une copie rangée ailleurs.
          onFolderPress={(event) =>
            setFolderMenu({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })
          }
          // L'échéance se change d'un appui, sans passer par « Modifier la liste ».
          onDuePress={() => setEditingDue(true)}
          onMenuPress={(event) =>
            setMenu({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })
          }
          menuLabel={`Actions pour ${list.title}`}
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

              <TaskRowCheckbox
                done={allDone}
                pending={list.tasks.length === 0}
                label={
                  allDone
                    ? `Décocher toute la liste ${list.title}`
                    : `Cocher toute la liste ${list.title}`
                }
                onPress={toggleAll}
              />

              <Text className="shrink text-sm font-semibold" numberOfLines={1}>
                {list.title}
              </Text>
              {/* Derrière le titre : devant, il ne reste que le repli. */}
              {gripRef ? (
                <TaskRowGrip
                  draggable
                  gripRef={gripRef}
                  label={`Déplacer la liste ${list.title}`}
                />
              ) : null}
            </>
          }
        />

        <CollapsibleContent>
          {/* La capture ne demande rien d'autre que du texte : ni date, ni
              dossier au moment où l'on écrit (§13.4.1). Le reste se pose
              ensuite, sur la liste. */}
          <TaskListCardBody desktop={desktop}>
            <TaskListEditor
              list={list}
              query={query}
              onOpenTask={onOpenTask}
              {...(visibleTaskIds ? { visibleTaskIds } : {})}
              {...(dueOnForNew ? { dueOnForNew } : {})}
            />
          </TaskListCardBody>
        </CollapsibleContent>
      </Collapsible>

      {/* Monté à la demande : `ContextMenu` rend une fenêtre modale dès qu'il
          existe, il n'a pas de garde interne. */}
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />
      ) : null}
      {folderMenu ? (
        <ContextMenu
          x={folderMenu.x}
          y={folderMenu.y}
          items={folderItems}
          onClose={() => setFolderMenu(null)}
        />
      ) : null}
      {editingDue ? <ListDueDialog list={list} onClose={() => setEditingDue(false)} /> : null}
    </TaskListCardFrame>
  );
}

/**
 * Ex. « jeudi 4 septembre · 14h30 », ou rien quand la liste n'a pas d'échéance.
 *
 * L'heure ne s'affiche que si l'échéance en vise une : `dueAllDay` le dit,
 * plutôt que de le relire dans l'horloge de l'appareil.
 */
export function dueLabel(list: Pick<TaskList, "dueAt" | "dueAllDay">): string | undefined {
  // `!` plutôt que `=== null` : le site et le serveur se déploient séparément, et
  // un serveur pas encore à jour ne renvoie pas `dueAt` pour une liste d'espace.
  if (!list.dueAt) return undefined;

  const due = new Date(list.dueAt);
  return list.dueAllDay === false
    ? `${formatFullDay(due)} · ${formatTime(list.dueAt)}`
    : formatFullDay(due);
}
