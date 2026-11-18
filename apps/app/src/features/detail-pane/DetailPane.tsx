import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { PanResponder, Platform, ScrollView, View, useWindowDimensions } from "react-native";
import { Check, Link2, Maximize2, Minimize2, X } from "lucide-react-native";
import type { Task, TaskList, TaskListWithTasks } from "@jc/domain";
import { datedLists, dueOnForDay, limitPastLists, listsInTimeOrder, listsOfDay } from "@jc/domain";
import { formatFullDay, isSameDay } from "@/shared/lib/dates";
import { useDetailPane, type PaneContent } from "@/shared/providers/detail-pane";
import { useFolderChoices, type FolderChoice } from "@/shared/hooks/use-folder-choices";
import { useTaskLists } from "@/shared/hooks/use-task-lists";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { HEADER_HEIGHT } from "@/shared/ui/screen-shell";
import { Text } from "@/shared/ui/text";
import { TaskDialog } from "@/features/todo/TaskDialog";
import { ListCard } from "@/features/todo/ListCard";
import { TaskListDeleteDialog } from "@/features/todo/TaskListDeleteDialog";
import { TaskListDialog, type TaskListTarget } from "@/features/todo/TaskListDialog";
import { isTaskSubset } from "@/features/calendar/DueListsBoard";
import { useListDragHandle, useMomentDropZone } from "@/features/calendar/lib/list-drag";
import { useTaskActions } from "@/shared/hooks/use-task-lists";
import { SuggestionPaneBody } from "@/features/conversation/SuggestionPaneBody";

/** En deçà, l'en-tête d'une liste se tronque ; au-delà, le milieu n'est plus lisible. */
const PANE_MIN_WIDTH = 360;
const PANE_MAX_WIDTH = 720;
/** Part de la fenêtre qu'il faut laisser au milieu, quelle que soit la largeur demandée. */
const CENTER_MIN_WIDTH = 480;
/** Listes passées montrées d'emblée dans le volet, comme dans « Mes listes » au milieu. */
const PANE_PAST_SLICE = 10;
/**
 * Temps pendant lequel la carte visée se replace quand la mise en page bouge.
 *
 * Les listes au-dessus finissent de se dessiner après l'ouverture (tâches,
 * dossiers) et repoussent la carte hors de l'écran. Chrome compense seul ; Safari
 * non (retour de Yann, 17 novembre : « Sport » à 14h, le volet s'ouvre sur lundi).
 * Passé ce délai, on ne touche plus au défilement : l'utilisateur a la main.
 */
const ANCHOR_WINDOW_MS = 2_500;
/** Air laissé au-dessus de la carte amenée à l'écran. */
const ANCHOR_MARGIN = 16;

/**
 * Volet de droite. Rien à l'écran tant qu'aucun contenu n'est choisi.
 */
export function DetailPane() {
  const { content, close, width, setWidth, expanded, setExpanded } = useDetailPane();
  const { width: windowWidth } = useWindowDimensions();
  // Le défilement du volet : la liste visée s'y amène elle-même, comme dans « Mes listes ».
  const scroll = useRef<ScrollView>(null);
  // La carte visée (ou proposée) : le volet la replace tant que la mise en page bouge.
  const anchor = useRef<View>(null);
  const openedAt = useRef(0);
  const reanchor = () => {
    if (Date.now() - openedAt.current > ANCHOR_WINDOW_MS) return;
    // Mesurée depuis le contenu du volet, pas depuis la fenêtre visible : sinon le
    // défilement déjà fait fausse la position et la carte repart vers le haut.
    const contentNode = scroll.current?.getInnerViewNode();
    if (!contentNode || !anchor.current) return;
    anchor.current.measureLayout(contentNode, (_x, y) => {
      scroll.current?.scrollTo({ y: Math.max(0, y - ANCHOR_MARGIN), animated: false });
    });
  };
  // À chaque choix d'un élément, volet ouvert ou non, la carte visée se met en
  // place une fois la mise en page faite, puis tant qu'elle bouge. C'est le volet
  // qui s'en charge, pas la carte : elle ne sait pas où en est le défilement
  // (retour de Yann, 18 novembre : en cliquant les rendez-vous du mardi 17 l'un
  // après l'autre, le volet ne se calait plus).
  useEffect(() => {
    openedAt.current = Date.now();
    const frame = requestAnimationFrame(reanchor);
    return () => cancelAnimationFrame(frame);
    // `reanchor` ne lit que des refs : le relire à chaque rendu ne changerait rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);
  if (!content) return null;

  // Le volet ne mange jamais le milieu : sur une fenêtre étroite, le plafond
  // descend avec elle plutôt que de laisser le calendrier illisible.
  const maxWidth = Math.max(
    PANE_MIN_WIDTH,
    Math.min(PANE_MAX_WIDTH, windowWidth - CENTER_MIN_WIDTH),
  );
  const paneWidth = Math.min(maxWidth, Math.max(PANE_MIN_WIDTH, width));

  return (
    <View
      className="border-border bg-background border-l"
      // Agrandi, le volet prend toute la place laissée par la barre latérale :
      // la largeur choisie à la main est gardée pour quand il se réduit.
      style={expanded ? { flex: 1 } : { width: paneWidth }}
      accessibilityLabel="Détail"
    >
      {expanded ? null : <ResizeHandle width={paneWidth} maxWidth={maxWidth} onResize={setWidth} />}
      {/* Même hauteur que le bandeau du milieu (`ScreenHeader`) : les deux
          lignes de séparation doivent tomber à la même hauteur. */}
      <View
        className="border-border flex-row items-center justify-between gap-2 border-b px-3"
        style={{ height: HEADER_HEIGHT }}
      >
        <Text className="min-w-0 flex-1 text-sm font-semibold" numberOfLines={1}>
          <PaneTitle content={content} />
        </Text>
        <View className="flex-row items-center">
          {/* Un lien n'a de sens que pour une liste, et sur le web où l'adresse
              existe : un jour du calendrier n'a pas d'adresse propre. */}
          {content.kind === "list" && Platform.OS === "web" ? (
            <ShareLinkButton listId={content.listId} />
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            hitSlop={8}
            onPress={() => setExpanded(!expanded)}
            accessibilityLabel={expanded ? "Réduire le détail" : "Agrandir le détail"}
            className="size-8"
          >
            <Icon
              as={expanded ? Minimize2 : Maximize2}
              size={16}
              className="text-muted-foreground"
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            hitSlop={8}
            onPress={close}
            accessibilityLabel="Fermer le détail"
            className="size-8"
          >
            <Icon as={X} size={16} className="text-muted-foreground" />
          </Button>
        </View>
      </View>
      <ScrollView
        ref={scroll}
        // Seule la taille du contenu est signalée sur le web, pas la position
        // d'une carte : c'est elle qui dit que quelque chose a grandi au-dessus.
        onContentSizeChange={reanchor}
        contentContainerStyle={{
          padding: 12,
          gap: 8,
          // Agrandi, la carte ne s'étire pas sur tout l'écran : elle reste lisible.
          ...(expanded ? { maxWidth: 880, width: "100%", alignSelf: "center" as const } : {}),
        }}
      >
        <PaneBody content={content} anchorRef={anchor} />
      </ScrollView>
    </View>
  );
}

/**
 * Copie l'adresse de la liste. Elle ouvre « Mes listes » sur cette liste : seul
 * son propriétaire, ou les membres de son espace, peut la lire.
 */
function ShareLinkButton({ listId }: { listId: string }) {
  const [copied, setCopied] = useState(false);

  // Le « copié » s'efface seul : il confirme le geste, il ne doit pas rester.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    const link = `${window.location.origin}/todo?list=${listId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch (error) {
      // Presse-papiers refusé (page non sécurisée, permission) : on le signale
      // plutôt que de l'avaler.
      console.warn("Copie du lien refusée", error);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      hitSlop={8}
      onPress={copy}
      accessibilityLabel={copied ? "Lien copié" : "Copier le lien de la liste"}
      className="size-8"
    >
      <Icon as={copied ? Check : Link2} size={16} className="text-muted-foreground" />
    </Button>
  );
}

/**
 * Poignée posée à cheval sur la bordure gauche du volet : tirer vers la gauche
 * l'élargit. Même mécanique que celle de la barre latérale, qui part de la
 * largeur à la prise et non de la largeur courante pour ne pas cumuler le
 * déplacement déjà appliqué.
 */
function ResizeHandle({
  width,
  maxWidth,
  onResize,
}: {
  width: number;
  maxWidth: number;
  onResize: (width: number) => void;
}) {
  const latest = useRef({ width, maxWidth, onResize });
  latest.current = { width, maxWidth, onResize };
  const startWidth = useRef(width);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startWidth.current = latest.current.width;
      },
      onPanResponderMove: (_event, gesture) => {
        const next = Math.min(
          latest.current.maxWidth,
          Math.max(PANE_MIN_WIDTH, startWidth.current - gesture.dx),
        );
        latest.current.onResize(next);
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  return (
    <View
      {...responder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel="Ajuster la largeur du détail"
      className="absolute inset-y-0 -left-1.5 z-10 w-3 web:cursor-col-resize"
    />
  );
}

function PaneTitle({ content }: { content: PaneContent }) {
  if (content.kind === "day") return <>{formatFullDay(content.day)}</>;
  if (content.kind === "suggestion") return <>Proposition de Jean-Claude</>;
  // Le titre de la liste est déjà celui de la carte : le volet dit où l'on est,
  // et ce qu'il ouvre, c'est bien « Mes listes » (Yann, 12 novembre).
  return <>Mes listes</>;
}

function PaneBody({
  content,
  anchorRef,
}: {
  content: PaneContent;
  anchorRef: RefObject<View | null>;
}) {
  if (content.kind === "suggestion") {
    return (
      <SuggestionPaneBody
        conversationId={content.conversationId}
        suggestionId={content.suggestionId}
        // Une todoliste proposée se lit dans « Mes listes », à sa date : on voit
        // où elle tombera avant de valider (Yann, 17 novembre).
        placeInLists={(card, dueAt) => (
          <ListPaneBody
            content={{ kind: "all" }}
            anchorRef={anchorRef}
            proposal={{ card, dueAt }}
          />
        )}
      />
    );
  }
  return <ListPaneBody content={content} anchorRef={anchorRef} />;
}

/** Ce que le corps du volet sait montrer : une liste visée, un jour, ou toutes les listes. */
type ListsContent = Exclude<PaneContent, { kind: "suggestion" }> | { kind: "all" };

/** Une carte proposée par l'assistant, pas encore créée : elle s'insère à sa date. */
type Proposal = { card: ReactNode; dueAt: string | null };

/** Rang de la proposition parmi les listes déjà dans l'ordre du temps. */
function proposalIndex(lists: TaskListWithTasks[], dueAt: string | null): number {
  if (dueAt === null) return lists.length;
  const at = new Date(dueAt).getTime();
  const after = lists.findIndex(
    (list) => list.dueAt === null || new Date(list.dueAt).getTime() > at,
  );
  return after === -1 ? lists.length : after;
}

/**
 * La carte proposée, amenée à l'écran une fois placée — sans animation, comme
 * une liste visée.
 */
function ProposalSlot({
  anchorRef,
  children,
}: {
  anchorRef: RefObject<View | null>;
  children: ReactNode;
}) {
  return <View ref={anchorRef}>{children}</View>;
}

function ListPaneBody({
  content,
  anchorRef,
  proposal,
}: {
  content: ListsContent;
  anchorRef: RefObject<View | null>;
  proposal?: Proposal;
}) {
  const { data: lists } = useTaskLists();
  const [pastKept, setPastKept] = useState(PANE_PAST_SLICE);
  const [openedTask, setOpenedTask] = useState<Task | null>(null);
  const [listTarget, setListTarget] = useState<TaskListTarget | null>(null);
  const [deleting, setDeleting] = useState<{ list: TaskList; occurrenceAt?: string } | null>(null);
  const folders = useFolderChoices();

  // La liste telle qu'enregistrée : une entrée du jour peut n'en être que la
  // projection sur les tâches de ce jour, qu'on ne doit pas renvoyer seules.
  const saved = lists ?? [];
  const day = content.kind === "day" ? content.day : null;
  const { entries, hiddenPast } = entriesOf(content, saved, pastKept);
  const targetId = content.kind === "list" ? content.listId : null;
  // La proposition de l'assistant s'insère à sa date parmi les listes enregistrées.
  const proposalAt = proposal
    ? proposalIndex(
        entries.map(({ list }) => list),
        proposal.dueAt,
      )
    : -1;
  const proposalSlot = proposal ? (
    <ProposalSlot key="proposal" anchorRef={anchorRef}>
      {proposal.card}
    </ProposalSlot>
  ) : null;

  const { updateList } = useTaskActions();

  // Deux listes du même jour échangent leurs heures : poser la liste de 19h
  // au-dessus de celle de 14h met la première à 14h et l'autre à 19h. Sans
  // heure ni l'une ni l'autre, il n'y a rien à échanger.
  const swapDue = (draggedId: string, targetId: string) => {
    const dragged = saved.find((candidate) => candidate.id === draggedId);
    const target = saved.find((candidate) => candidate.id === targetId);
    if (!dragged?.dueAt || !target?.dueAt) return;
    if (dragged.dueAt === target.dueAt && dragged.dueAllDay === target.dueAllDay) return;

    updateList.mutate({
      id: dragged.id,
      patch: { dueAt: target.dueAt, dueAllDay: target.dueAllDay ?? true },
    });
    updateList.mutate({
      id: target.id,
      patch: { dueAt: dragged.dueAt, dueAllDay: dragged.dueAllDay ?? true },
    });
  };
  const movableIds = new Set(
    day
      ? entries
          .filter(
            ({ list }) =>
              list.dueAt !== null && isSameDay(new Date(list.dueAt), day) && entries.length > 1,
          )
          .map(({ list }) => list.id)
      : [],
  );

  const editedTask =
    openedTask === null
      ? null
      : (saved.flatMap((list) => list.tasks).find((task) => task.id === openedTask.id) ?? null);

  return (
    <>
      {entries.length === 0 && !proposal ? (
        <Text className="text-muted-foreground text-sm">
          {day ? "Aucune tâche ce jour-là." : "Cette liste n'existe plus."}
        </Text>
      ) : (
        <>
          {hiddenPast > 0 ? (
            // En haut : le passé est au-dessus de la liste visée, dans l'ordre du temps.
            <Button
              variant="outline"
              size="sm"
              onPress={() => setPastKept((current) => current + PANE_PAST_SLICE)}
              accessibilityRole="button"
              accessibilityLabel={`Afficher ${Math.min(PANE_PAST_SLICE, hiddenPast)} listes plus anciennes`}
            >
              <Text>{`Afficher des listes plus anciennes (${hiddenPast})`}</Text>
            </Button>
          ) : null}
          {entries.flatMap(({ list, day: forDay }, index) => [
            index === proposalAt ? proposalSlot : null,
            <PaneList
              key={`${list.id}-${forDay?.toDateString() ?? "all"}`}
              shown={list}
              saved={saved.find((candidate) => candidate.id === list.id) ?? list}
              day={forDay}
              folders={folders}
              movableIds={movableIds}
              onSwap={swapDue}
              onOpenTask={setOpenedTask}
              onEdit={(target) => setListTarget({ mode: "edit", list: target })}
              onDelete={(target) =>
                // La date cliquée ne vaut que pour la liste visée : une autre carte
                // du volet n'a pas de date à elle.
                setDeleting({
                  list: target,
                  ...(content.kind === "list" &&
                  target.id === content.listId &&
                  content.occurrenceAt
                    ? { occurrenceAt: content.occurrenceAt }
                    : {}),
                })
              }
              highlighted={list.id === targetId}
              anchorRef={anchorRef}
            />,
          ])}
          {proposalAt === entries.length ? proposalSlot : null}
        </>
      )}
      <TaskDialog task={editedTask} onClose={() => setOpenedTask(null)} />
      <TaskListDialog target={listTarget} onClose={() => setListTarget(null)} />
      <TaskListDeleteDialog
        list={deleting?.list ?? null}
        occurrenceAt={deleting?.occurrenceAt}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

/**
 * Une liste dans le volet : la carte de « Mes listes », en-tête, repli et
 * éditeur compris. Pour un jour donné, seules les tâches de ce jour sont
 * montrées, et une ligne nouvelle rejoint ce jour.
 */
function PaneList({
  shown,
  saved,
  day,
  folders,
  movableIds,
  onSwap,
  onOpenTask,
  onEdit,
  onDelete,
  highlighted,
  anchorRef,
}: {
  shown: TaskListWithTasks;
  saved: TaskListWithTasks;
  day: Date | null;
  folders: FolderChoice[];
  /** Les listes de ce jour qui se déplacent, et sur lesquelles on peut en poser une autre. */
  movableIds: ReadonlySet<string>;
  onSwap: (draggedId: string, targetId: string) => void;
  onOpenTask: (task: Task) => void;
  onEdit: (list: TaskList) => void;
  onDelete: (list: TaskList) => void;
  /** La liste visée par le clic : mise en avant, et amenée à l'écran. */
  highlighted: boolean;
  /** La carte visée s'y inscrit : le volet la replace quand la mise en page bouge. */
  anchorRef: RefObject<View | null>;
}) {
  const dueOn = day ? dueOnForDay(saved, day) : null;
  const subset = isTaskSubset(saved, shown);
  const movable = movableIds.has(saved.id);
  const web = Platform.OS === "web";

  // La carte est à la fois ce qu'on saisit (par sa poignée) et ce sur quoi on
  // en pose une autre : les deux restent réservés aux listes du même jour.
  const { cardRef, gripRef } = useListDragHandle(saved.id, web && movable);
  const zoneRef = useMomentDropZone(
    web && movable,
    (drag) => drag.kind === "list" && drag.listId !== saved.id && movableIds.has(drag.listId),
    (drag) => onSwap(drag.listId, saved.id),
  );

  return (
    <View ref={highlighted ? anchorRef : undefined}>
      <View ref={zoneRef}>
        <View ref={cardRef}>
          <ListCard
            list={saved}
            folders={folders}
            desktop
            query=""
            highlighted={highlighted}
            onOpenTask={onOpenTask}
            onEdit={() => onEdit(saved)}
            onDelete={() => onDelete(saved)}
            {...(subset ? { visibleTaskIds: shown.tasks.map((task) => task.id) } : {})}
            {...(dueOn ? { dueOnForNew: dueOn } : {})}
            {...(web && movable ? { gripRef } : {})}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * Les listes à montrer pour ce contenu : « Mes listes » dans l'ordre du temps
 * quand on vise une liste, ou celles d'un jour.
 *
 * La liste visée reste toujours à l'écran, même ancienne : le passé n'est
 * allégé que s'il ne la cache pas.
 */
function entriesOf(
  content: ListsContent,
  saved: TaskListWithTasks[],
  pastKept: number,
): { entries: { list: TaskListWithTasks; day: Date | null }[]; hiddenPast: number } {
  if (content.kind === "list" || content.kind === "all") {
    const targetId = content.kind === "list" ? content.listId : null;
    if (targetId !== null && !saved.some((list) => list.id === targetId)) {
      return { entries: [], hiddenPast: 0 };
    }

    const sorted = listsInTimeOrder(saved);
    const limited = limitPastLists(sorted, new Date(), pastKept);
    const reachable = targetId === null || limited.lists.some((list) => list.id === targetId);
    const shown = reachable ? limited : { lists: sorted, hidden: 0 };
    return {
      entries: shown.lists.map((list) => ({ list, day: null })),
      hiddenPast: shown.hidden,
    };
  }
  return {
    entries: listsOfDay(datedLists(saved), content.day).map((list) => ({
      list,
      day: content.day,
    })),
    hiddenPast: 0,
  };
}
