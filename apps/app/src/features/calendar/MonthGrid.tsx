import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRef, type ReactNode } from "react";
import { ListChecks, Users } from "lucide-react-native";
import type { CalendarEntry, TaskListWithTasks } from "@jc/domain";
import { eventsOfDay, listsOfDay, openTaskCount } from "@jc/domain";
import { Icon } from "@/shared/ui/icon";
import { Text } from "@/shared/ui/text";
import { formatTime, isSameDay, startOfDay, WEEKDAY_LABELS } from "@/shared/lib/dates";
import { usePointerDropTarget, usePointerListDrag } from "./lib/pointer-drag";

export type MonthGridProps = {
  /** Les 42 jours de la grille, lundi en tête. */
  days: Date[];
  /** Mois mis en avant ; les jours des mois voisins sont atténués. */
  anchor: Date;
  events: CalendarEntry[];
  /** Todolistes échues, toutes listes confondues : ce qui charge la journée (A.2). */
  lists: TaskListWithTasks[];
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  onOpenEvent: (event: CalendarEntry) => void;
  /**
   * Ouvre une liste. Absent quand le volet de droite n'existe pas (téléphone) :
   * la ligne de la liste reste alors un simple repère.
   */
  onOpenList?: (list: TaskListWithTasks) => void;
  /** Une liste lâchée sur un jour (web) : elle garde son heure, seul le jour change. */
  onMoveList: (listId: string, day: Date) => void;
  /** Une liste lâchée sur une autre du même jour : elles échangent leurs heures. */
  onSwapLists: (draggedId: string, targetId: string) => void;
  /** En deçà du point de rupture : pastilles au lieu des titres. */
  compact: boolean;
};

/** Ce qu'une cellule tient sous son numéro de jour : au-delà, elle déborde. */
const MAX_LINES_PER_CELL = 3;

/**
 * Grille mensuelle.
 *
 * Les noms de jours restent en tête. Ce sont les semaines qui défilent, dans
 * le cadre : le haut de la grille ne quitte pas l'écran.
 *
 * En `compact`, les titres cèdent la place à des pastilles : un titre dans une
 * cellule étroite se tronque au deuxième caractère (§4.2).
 */
export function MonthGrid({
  days,
  anchor,
  events,
  lists,
  selectedDay,
  onSelectDay,
  onOpenEvent,
  onOpenList,
  onMoveList,
  onSwapLists,
  compact,
}: MonthGridProps) {
  const today = new Date();

  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));

  return (
    <View className="border-border min-h-0 flex-1 overflow-hidden rounded-xl border">
      <View className="border-border flex-row border-b">
        {WEEKDAY_LABELS.map((label) => (
          <View key={label} className="flex-1 px-2 py-2">
            <Text className="text-muted-foreground text-xs">{label}</Text>
          </View>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        <View className="min-h-full flex-1">
          {weeks.map((week) => (
            <View
              key={week[0]?.toISOString()}
              className="flex-1 flex-row"
              style={{ minHeight: compact ? 64 : 96 }}
            >
              {week.map((day) => {
                const outside = day.getMonth() !== anchor.getMonth();
                const isToday = isSameDay(day, today);
                const selected = isSameDay(day, selectedDay);
                // Chaque liste garde son titre : une liste est une chose à part entière,
                // pas un compte de tâches fusionné avec celles du même jour (Yann,
                // 12 novembre). Rendez-vous et listes partagent donc le même budget
                // de lignes et le même « N autres » que Google Agenda.
                const entries = cellEntries(eventsOfDay(events, day), listsOfDay(lists, day));
                const openTasks = entries.reduce(
                  (count, entry) => count + (entry.kind === "list" ? openTaskCount(entry.list) : 0),
                  0,
                );
                const { shown, hidden } = fitEntries(entries, compact);

                return (
                  <DayCell
                    key={day.toISOString()}
                    // Un jour révolu ne reçoit pas de liste, comme dans la grille
                    // horaire : dater dans le passé est un geste rare, qui passe
                    // par « Changer l'échéance ».
                    droppable={startOfDay(day).getTime() >= startOfDay(today).getTime()}
                    onDropList={(listId) => onMoveList(listId, day)}
                    className={`border-border min-w-0 flex-1 gap-1 border-b border-r p-1 ${
                      selected ? "bg-accent-soft" : ""
                    }`}
                  >
                    {/* La cellule n'est pas elle-même pressable : elle porte les
                  rendez-vous, qui le sont, et un bouton dans un bouton n'est
                  pas du HTML valide. Le sélecteur de jour est donc posé en
                  fond — avant eux dans la pile, pour qu'ils captent l'appui
                  qui les vise — et le contenu inerte le laisse passer. */}
                    <Pressable
                      style={StyleSheet.absoluteFill}
                      onPress={() => onSelectDay(day)}
                      accessibilityRole="button"
                      accessibilityLabel={`${day.getDate()}, ${entries.length} élément(s), ${openTasks} tâche(s) à faire`}
                      accessibilityState={{ selected }}
                    />

                    <View className="flex-row justify-end" style={{ pointerEvents: "none" }}>
                      <Text
                        className={`text-xs ${outside ? "text-muted-foreground" : "text-foreground"} ${
                          isToday
                            ? "bg-primary text-primary-foreground h-5 w-5 rounded-full text-center leading-5"
                            : ""
                        }`}
                      >
                        {day.getDate()}
                      </Text>
                    </View>

                    {/* `box-none` et non `none` : la colonne elle-même laisse passer
                  l'appui vers le sélecteur de jour, mais les lignes qu'elle
                  porte restent pressables. */}
                    <View className="gap-0.5" style={{ pointerEvents: "box-none" }}>
                      {shown.map((entry) => (
                        <EntryLine
                          key={entry.key}
                          entry={entry}
                          onOpenEvent={onOpenEvent}
                          // Poser une liste sur une autre du même jour échange
                          // leurs heures ; d'un autre jour, le dépôt tombe sur la case.
                          canSwapWith={(draggedId) =>
                            entry.kind === "list" &&
                            draggedId !== entry.list.id &&
                            listsOfDay(lists, day).some((candidate) => candidate.id === draggedId)
                          }
                          onSwap={onSwapLists}
                          {...(onOpenList ? { onOpenList } : {})}
                        />
                      ))}
                      {hidden > 0 ? (
                        <View style={{ pointerEvents: "none" }}>
                          <Text className="text-muted-foreground px-1 text-[11px]">
                            {hidden === 1 ? "1 autre" : `${hidden} autres`}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </DayCell>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** Une ligne de cellule : un rendez-vous ou une liste, mêlés dans l'ordre du jour. */
type CellEntry =
  | { kind: "event"; key: string; sortAt: string; event: CalendarEntry }
  | { kind: "list"; key: string; sortAt: string; list: TaskListWithTasks };

/**
 * Les rendez-vous et les listes d'un jour, dans l'ordre du temps : ce qui dure
 * toute la journée d'abord, puis par heure.
 */
function cellEntries(events: CalendarEntry[], lists: TaskListWithTasks[]): CellEntry[] {
  const all: CellEntry[] = [
    ...events.map((event): CellEntry => ({
      kind: "event",
      key: `event-${event.id}`,
      sortAt: event.allDay ? "" : event.startsAt,
      event,
    })),
    ...lists.map((list): CellEntry => ({
      kind: "list",
      key: `list-${list.id}-${list.dueAt ?? ""}`,
      sortAt: list.dueAllDay === false ? (list.dueAt ?? "") : "",
      list,
    })),
  ];
  return all.sort((a, b) => a.sortAt.localeCompare(b.sortAt));
}

/**
 * Ce qu'une cellule montre, et ce qu'elle en tait.
 *
 * Le « N autres » occupe une ligne au même titre que les autres : le compter
 * dans le même budget est ce qui empêche une journée chargée de déborder de sa
 * cellule. Sur téléphone, la cellule est trop étroite pour plus d'un titre : on
 * montre le premier, puis « N autres » (décision de Yann, 12 novembre).
 */
function fitEntries(
  entries: CellEntry[],
  compact: boolean,
): { shown: CellEntry[]; hidden: number } {
  const room = compact ? 1 : MAX_LINES_PER_CELL;
  const shown =
    entries.length <= room ? entries : entries.slice(0, Math.max(room - 1, compact ? 1 : 0));
  return { shown, hidden: entries.length - shown.length };
}

/** La ligne d'un rendez-vous ou d'une liste, même allure : un titre précédé de son heure. */
function EntryLine({
  entry,
  onOpenEvent,
  onOpenList,
  canSwapWith,
  onSwap,
}: {
  entry: CellEntry;
  onOpenEvent: (event: CalendarEntry) => void;
  onOpenList?: (list: TaskListWithTasks) => void;
  canSwapWith: (draggedId: string) => boolean;
  onSwap: (draggedId: string, targetId: string) => void;
}) {
  if (entry.kind === "event") {
    const { event } = entry;
    return (
      <Pressable
        onPress={() => onOpenEvent(event)}
        accessibilityRole="button"
        accessibilityLabel={eventLabel(event)}
        className="bg-accent-soft flex-row items-center gap-0.5 rounded px-1 py-0.5"
      >
        {event.space ? <SharedMark /> : null}
        <Text
          numberOfLines={1}
          className="text-accent-soft-foreground flex-1 text-[11px] leading-4"
        >
          {event.allDay ? event.title : `${formatTime(event.startsAt)} ${event.title}`}
        </Text>
      </Pressable>
    );
  }

  const { list } = entry;
  const done = list.tasks.length > 0 && openTaskCount(list) === 0;
  const timed = list.dueAllDay === false && list.dueAt !== null;
  const content = (
    <>
      <Icon as={ListChecks} size={10} className="text-accent-soft-foreground" />
      <Text
        numberOfLines={1}
        className={`text-accent-soft-foreground flex-1 text-[11px] leading-4 ${
          done ? "line-through opacity-60" : ""
        }`}
      >
        {timed && list.dueAt ? `${formatTime(list.dueAt)} ${list.title}` : list.title}
      </Text>
    </>
  );

  // Cliquable seulement quand il y a un volet où montrer la liste.
  if (onOpenList) {
    return (
      <DraggableListLine
        list={list}
        onOpen={() => onOpenList(list)}
        canSwapWith={canSwapWith}
        onSwap={(draggedId) => onSwap(draggedId, list.id)}
      >
        {content}
      </DraggableListLine>
    );
  }

  return (
    <View
      className="bg-accent-soft flex-row items-center gap-0.5 rounded px-1 py-0.5"
      style={{ pointerEvents: "none" }}
    >
      {content}
    </View>
  );
}

/**
 * Cellule d'un jour : cible de dépôt d'une liste (web, souris).
 *
 * Composant à part parce que la cible est un hook, qu'on ne peut pas appeler
 * dans la boucle des jours. Seule une liste entière s'y pose : une ligne de
 * tâche glissée depuis une carte n'a pas de sens ici.
 */
function DayCell({
  droppable,
  onDropList,
  className,
  children,
}: {
  droppable: boolean;
  onDropList: (listId: string) => void;
  className: string;
  children: ReactNode;
}) {
  const zoneRef = useRef<View | null>(null);
  usePointerDropTarget(zoneRef, droppable, () => true, onDropList);
  return (
    <View ref={zoneRef} className={className}>
      {children}
    </View>
  );
}

/** Ligne de liste que l'on saisit pour la déplacer (web) ; l'appui simple l'ouvre. */
function DraggableListLine({
  list,
  onOpen,
  canSwapWith,
  onSwap,
  children,
}: {
  list: TaskListWithTasks;
  onOpen: () => void;
  canSwapWith: (draggedId: string) => boolean;
  onSwap: (draggedId: string) => void;
  children: ReactNode;
}) {
  const { cardRef } = usePointerListDrag(list.id, Platform.OS === "web");
  usePointerDropTarget(cardRef, Platform.OS === "web", canSwapWith, onSwap);
  return (
    <Pressable
      ref={cardRef}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Voir la liste ${list.title}`}
      className="bg-accent-soft flex-row items-center gap-0.5 rounded px-1 py-0.5"
    >
      {children}
    </Pressable>
  );
}

/**
 * Marque d'un événement d'espace : il est au calendrier de tous les membres
 * d'une conversation, pas seulement au sien.
 */
export function SharedMark() {
  return <Icon as={Users} size={10} className="text-accent-soft-foreground" />;
}

/** Libellé lu par un lecteur d'écran : l'espace, quand l'événement est partagé. */
export function eventLabel(event: CalendarEntry): string {
  return event.space
    ? `Modifier ${event.title}, ${event.space.workspaceName} · ${event.space.groupTitle}`
    : `Modifier ${event.title}`;
}
