import { useEffect, useRef, useState, type Ref, type RefObject } from "react";
import { Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import {
  isListDone,
  presetOfRrule,
  RECURRENCE_CHOICES,
  type Task,
  type TaskList,
  type TaskListWithTasks,
} from "@jc/domain";
import { Button } from "@/shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import { ContextMenu, type ContextMenuItem } from "@/shared/ui/context-menu";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { FONT_FAMILY } from "@/shared/lib/fonts";
import { cn } from "@/shared/lib/utils";
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
import { ListDuePanel } from "./ListDuePanel";
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
  flat = false,
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
  /** Sans contour, plus basse : la carte du calendrier, déjà située par son jour. */
  flat?: boolean;
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
  // Date et heure se règlent dans un panneau sous le doigt, sans fenêtre.
  const [duePanel, setDuePanel] = useState<{ x: number; y: number } | null>(null);
  const [typeMenu, setTypeMenu] = useState<{ x: number; y: number } | null>(null);
  // Le titre se change sur place : un appui l'ouvre en saisie, Entrée ou la
  // sortie du champ l'enregistre, Échap l'abandonne (demande de Yann, 23 novembre).
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(list.title);
  const cancelRename = useRef(false);
  // Entrée ferme le champ : sa sortie (`onBlur`) ne doit pas enregistrer une seconde fois.
  const renameDone = useRef(false);
  const finishRename = () => {
    if (renameDone.current) return;
    renameDone.current = true;
    const next = draftTitle.trim();
    setRenaming(false);
    if (cancelRename.current) {
      cancelRename.current = false;
      setDraftTitle(list.title);
      return;
    }
    // Un titre vidé n'est pas un titre : on garde l'ancien.
    if (next === "" || next === list.title) {
      setDraftTitle(list.title);
      return;
    }
    updateList.mutate({ id: list.id, patch: { title: next } });
  };
  const { updateList, updateTask, setOccurrence } = useTaskActions();
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
      // Mesurée depuis le contenu défilant, pas depuis la fenêtre visible : sinon le
      // défilement déjà fait fausse la position quand l'écran n'est pas en haut.
      // La carte peut être imbriquée sous n'importe quel nombre de vues
      // intermédiaires, `measureLayout` s'en affranchit.
      const scrollNode = scrollRef.current?.getInnerViewNode();
      if (!scrollNode) return;

      card.current?.measureLayout(scrollNode, (_x, y) => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, y - HIGHLIGHT_SCROLL_MARGIN),
          // Sans animation : on arrive directement sur la carte, sans la voir
          // glisser (Yann, 17 novembre).
          animated: false,
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
    // Une liste sans tâche n'a rien à cocher : c'est elle qui porte son « fait » —
    // pour la seule date de la série, quand c'est une copie de série.
    if (list.tasks.length === 0) {
      if (list.occurrenceAt) {
        setOccurrence.mutate({ id: list.id, input: { occurrenceAt: list.occurrenceAt, done } });
      } else {
        updateList.mutate({ id: list.id, patch: { done } });
      }
      return;
    }
    for (const task of list.tasks) {
      if (task.done !== done)
        updateTask.mutate({ listId: list.id, taskId: task.id, patch: { done } });
    }
  };

  const shopping = list.kind === "shopping";
  // La date seule à droite ; l'heure passe devant le titre, en gras.
  const due = list.dueAt ? formatFullDay(new Date(list.dueAt)) : undefined;
  const time = list.dueAt && list.dueAllDay === false ? formatTime(list.dueAt) : undefined;
  const folderName = folders.find((folder) => folder.id === list.folderId)?.name;

  const chooseFolder = (folderId: string | null) => {
    setFolderMenu(null);
    if (folderId !== list.folderId) updateList.mutate({ id: list.id, patch: { folderId } });
  };

  const folderItems: ContextMenuItem[] = [
    { label: "Aucun dossier", onPress: () => chooseFolder(null) },
    ...folders.map((folder) => ({ label: folder.name, onPress: () => chooseFolder(folder.id) })),
  ];

  const chooseKind = (kind: "todo" | "shopping") => {
    setTypeMenu(null);
    if (kind !== list.kind) updateList.mutate({ id: list.id, patch: { kind } });
  };
  const typeItems: ContextMenuItem[] = [
    { label: "Liste de tâches", onPress: () => chooseKind("todo") },
    { label: "Liste d'achats", onPress: () => chooseKind("shopping") },
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
    <TaskListCardFrame cardRef={card} desktop={desktop} highlighted={highlighted} flat={flat}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <TaskListCardHeader
          compact={flat}
          title={list.title}
          shopping={shopping}
          folderName={folderName}
          due={due}
          location={list.location ?? undefined}
          repeat={repeatLabel(list)}
          // Le dossier se change ici parce que la liste s'y voit aussi (A.2) :
          // c'est la même liste, pas une copie rangée ailleurs.
          onFolderPress={(event) =>
            setFolderMenu({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })
          }
          // L'échéance se change d'un appui, sans passer par « Modifier la liste ».
          onDuePress={(event) =>
            setDuePanel({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })
          }
          onTypePress={(event) =>
            setTypeMenu({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })
          }
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
                  className={flat ? "-ml-1 size-7" : "-ml-1 size-8"}
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
                label={
                  allDone
                    ? `Décocher toute la liste ${list.title}`
                    : `Cocher toute la liste ${list.title}`
                }
                onPress={toggleAll}
              />

              {renaming ? (
                <TextInput
                  value={draftTitle}
                  onChangeText={setDraftTitle}
                  autoFocus
                  selectTextOnFocus
                  maxLength={120}
                  accessibilityLabel={`Titre de la liste ${list.title}`}
                  onKeyPress={(event) => {
                    if (event.nativeEvent.key === "Escape") {
                      cancelRename.current = true;
                      finishRename();
                    }
                  }}
                  onSubmitEditing={finishRename}
                  onBlur={finishRename}
                  style={{ fontFamily: FONT_FAMILY, minWidth: 220 }}
                  className={cn(
                    "text-foreground border-input rounded-md border px-1.5 py-0.5 text-sm font-semibold",
                    Platform.select({ web: "outline-none" }),
                  )}
                />
              ) : (
                <>
                  {time ? (
                    <Pressable
                      onPress={(event) =>
                        setDuePanel({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })
                      }
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Heure de ${list.title} : ${time}`}
                    >
                      <Text className="text-sm font-semibold">{time}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => {
                      setDraftTitle(list.title);
                      renameDone.current = false;
                      setRenaming(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Renommer ${list.title}`}
                    className="shrink"
                  >
                    <Text className="shrink text-sm font-semibold" numberOfLines={1}>
                      {list.title}
                    </Text>
                  </Pressable>
                </>
              )}
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
      {typeMenu ? (
        <ContextMenu
          x={typeMenu.x}
          y={typeMenu.y}
          items={typeItems}
          onClose={() => setTypeMenu(null)}
        />
      ) : null}
      {duePanel ? (
        <ListDuePanel list={list} x={duePanel.x} y={duePanel.y} onClose={() => setDuePanel(null)} />
      ) : null}
    </TaskListCardFrame>
  );
}

/**
 * Ex. « 14h30 · jeudi 4 septembre », ou rien quand la liste n'a pas d'échéance.
 *
 * L'heure ne s'affiche que si l'échéance en vise une : `dueAllDay` le dit,
 * plutôt que de le relire dans l'horloge de l'appareil.
 */
/**
 * Ce que la carte dit de la répétition : le choix (« Toutes les semaines »), ou
 * « Répétition » pour une règle de Jean-Claude que les quatre choix ne disent pas.
 */
function repeatLabel(list: Pick<TaskList, "rrule" | "dueAt">): string | undefined {
  const preset = presetOfRrule(list.rrule, list.dueAt ? new Date(list.dueAt) : new Date());
  if (preset === "none") return undefined;
  if (preset === "custom") return "Répétition";
  return RECURRENCE_CHOICES.find((choice) => choice.preset === preset)?.label;
}

export function dueLabel(list: Pick<TaskList, "dueAt" | "dueAllDay">): string | undefined {
  // `!` plutôt que `=== null` : le site et le serveur se déploient séparément, et
  // un serveur pas encore à jour ne renvoie pas `dueAt` pour une liste d'espace.
  if (!list.dueAt) return undefined;

  const due = new Date(list.dueAt);
  return list.dueAllDay === false
    ? `${formatTime(list.dueAt)} · ${formatFullDay(due)}`
    : formatFullDay(due);
}
