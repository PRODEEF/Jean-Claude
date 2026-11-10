import { useEffect, useRef, useState, type RefObject } from "react";
import { ScrollView, View } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import type { Task, TaskList, TaskListWithTasks } from "@jc/domain";
import { Button } from "@/shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import { ContextMenu, type ContextMenuItem } from "@/shared/ui/context-menu";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import {
  TaskListCardBody,
  TaskListCardFrame,
  TaskListCardHeader,
} from "@/shared/ui/task-list-card";
import { formatFullDay, formatTime } from "@/shared/lib/dates";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useFolderChoices, type FolderChoice } from "@/shared/hooks/use-folder-choices";
import { useTaskActions } from "@/shared/hooks/use-task-lists";
import { ListDueDialog } from "./ListDueDialog";
import { TaskListEditor } from "./TaskListEditor";

/**
 * Ordre donné à toutes les cartes d'un coup : replier ou déplier.
 *
 * `version` change à chaque ordre, même répété : sans lui, replier deux fois de
 * suite après avoir rouvert une carte à la main ne ferait rien la seconde fois.
 */
export type FoldCommand = { open: boolean; version: number };

export type ListsBoardProps = {
  lists: TaskListWithTasks[];
  /** Liste ouverte depuis la barre latérale : mise en avant à l'arrivée. */
  highlightedId?: string;
  /** Défilement de l'écran — pour amener la liste mise en avant à l'écran. */
  scrollRef?: RefObject<ScrollView | null>;
  /** Recherche en cours, transmise aux lignes pour les mettre en avant. */
  query: string;
  /** Dernier ordre « tout replier / tout déplier ». */
  fold?: FoldCommand;
  onEditList: (list: TaskList) => void;
  onDeleteList: (list: TaskList) => void;
  onOpenTask: (task: Task) => void;
};

/**
 * Toutes les listes, tous dossiers confondus (A.2).
 *
 * Les listes d'achats et les listes de tâches cohabitent sans être fusionnées :
 * une conversation sur le jardin en produit typiquement une de chaque, et les
 * réunir ferait perdre la distinction (§12.1).
 */
export function ListsBoard({
  lists,
  highlightedId,
  scrollRef,
  query,
  fold,
  onEditList,
  onDeleteList,
  onOpenTask,
}: ListsBoardProps) {
  const folders = useFolderChoices();
  // Resserré sur grand écran seulement : au doigt, l'espace généreux laisse
  // de la marge à l'erreur, alors que la souris pointe avec précision et
  // profite d'en voir plus à la fois.
  const desktop = useBreakpoint() === "expanded";

  if (lists.length === 0) {
    return (
      <Text className="text-muted-foreground text-sm">
        Aucune liste pour l'instant. Créez-en une, ou laissez Jean-Claude vous en proposer une au
        fil d'une conversation.
      </Text>
    );
  }

  return (
    <View className={desktop ? "gap-2" : "gap-3"}>
      {lists.map((list) => (
        <ListCard
          key={list.id}
          list={list}
          folders={folders}
          highlighted={list.id === highlightedId}
          desktop={desktop}
          {...(scrollRef ? { scrollRef } : {})}
          query={query}
          {...(fold ? { fold } : {})}
          onEdit={() => onEditList(list)}
          onDelete={() => onDeleteList(list)}
          onOpenTask={onOpenTask}
        />
      ))}
    </View>
  );
}

/** Marge laissée au-dessus de la carte mise en avant, pour ne pas la coller au bandeau. */
const HIGHLIGHT_SCROLL_MARGIN = 16;

function ListCard({
  list,
  folders,
  highlighted,
  desktop,
  scrollRef,
  query,
  fold,
  onEdit,
  onDelete,
  onOpenTask,
}: {
  list: TaskListWithTasks;
  folders: FolderChoice[];
  highlighted: boolean;
  desktop: boolean;
  scrollRef?: RefObject<ScrollView | null>;
  query: string;
  fold?: FoldCommand;
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
  const { updateList } = useTaskActions();
  const card = useRef<View>(null);

  // Amène la carte visée depuis la barre latérale à l'écran : la mettre en
  // avant ne suffit pas quand « Mes listes » en compte assez pour déborder
  // l'écran, la carte reste alors hors champ malgré sa bordure.
  useEffect(() => {
    if (!highlighted || !scrollRef) return;

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
  }, [highlighted, scrollRef]);

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

              <Text className="shrink text-sm font-semibold" numberOfLines={1}>
                {list.title}
              </Text>
            </>
          }
        />

        <CollapsibleContent>
          {/* La capture ne demande rien d'autre que du texte : ni date, ni
              dossier au moment où l'on écrit (§13.4.1). Le reste se pose
              ensuite, sur la liste. */}
          <TaskListCardBody desktop={desktop}>
            <TaskListEditor list={list} query={query} onOpenTask={onOpenTask} />
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
