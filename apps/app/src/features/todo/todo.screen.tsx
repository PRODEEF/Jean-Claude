import { useEffect, useMemo, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react-native";
import type { Task, TaskList } from "@jc/domain";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { useBreakpoint } from "@/shared/hooks/use-breakpoint";
import { useFolderChoices } from "@/shared/hooks/use-folder-choices";
import { useTaskLists } from "@/shared/hooks/use-task-lists";
import { addDays, startOfWeek, weekDays, weekLabel } from "@/shared/lib/dates";
import {
  datedLists,
  filterListsByFolder,
  filterListsByQuery,
  usedFolderIds,
} from "@/shared/lib/tasks";
import { Button } from "@/shared/ui/button";
import { GRID_MAX_WIDTH, ScreenShell } from "@/shared/ui/screen-shell";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { SegmentedControl, type SegmentedOption } from "@/shared/ui/segmented-control";
import { Text } from "@/shared/ui/text";
import { FolderFilterBar } from "./FolderFilterBar";
import { ListsBoard } from "./ListsBoard";
import { TaskDialog } from "./TaskDialog";
import { TaskListDeleteDialog } from "./TaskListDeleteDialog";
import { TaskListDialog, type TaskListTarget } from "./TaskListDialog";
import { WeekBoard } from "./WeekBoard";

type TodoView = "lists" | "week";

/**
 * « Mes listes » en premier.
 *
 * C'est la lecture complète — une liste sans échéance n'existe que là — et
 * celle par laquelle on arrive dans l'onglet. La semaine est une vue dérivée :
 * elle ne montre que ce qui est daté, et se lit à sa droite comme un filtre
 * posé sur la première.
 */
const VIEWS: SegmentedOption<TodoView>[] = [
  { value: "lists", label: "Mes listes" },
  { value: "week", label: "Semaine" },
];

/**
 * Onglet TODOLISTE — vue centralisée, tous dossiers confondus (A.2).
 *
 * Deux lectures d'une même donnée : les listes, où une liste sans échéance
 * reste visible, et la semaine, qui ne montre que ce qui est daté. Une liste
 * d'achats n'a pas toujours de date : la cantonner à la semaine la rendrait
 * introuvable.
 *
 * Un seul chargement les alimente toutes les deux — basculer de l'une à
 * l'autre ne redemande rien au serveur.
 */
export function TodoScreen() {
  const compact = useBreakpoint() === "compact";
  const { list: openedList } = useLocalSearchParams<{ list?: string }>();

  const [view, setView] = useState<TodoView>("lists");
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [listTarget, setListTarget] = useState<TaskListTarget | null>(null);
  const [deletingList, setDeletingList] = useState<TaskList | null>(null);
  const [openedTask, setOpenedTask] = useState<Task | null>(null);
  /** Dossier retenu : `undefined` = tous, `null` = les listes sans dossier. */
  const [folderId, setFolderId] = useState<string | null | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const search = useRef<TextInput>(null);

  // Arriver depuis la barre latérale ouvre la liste visée : l'écran est déjà
  // monté quand le paramètre change, et l'état initial ne suffit donc pas. Le
  // filtre est relâché au passage — on a demandé cette liste-là, elle ne doit
  // pas rester masquée par un filtre posé plus tôt.
  useEffect(() => {
    if (openedList) {
      setView("lists");
      setFolderId(undefined);
      setQuery("");
    }
  }, [openedList]);

  const { data, isPending, isError } = useTaskLists();
  const lists = useMemo(() => data ?? [], [data]);
  const folders = useFolderChoices();

  // Le filtre s'applique aux listes, donc aux deux vues d'un coup : la semaine
  // n'est qu'une autre lecture des mêmes listes.
  const visibleLists = useMemo(
    () => filterListsByQuery(filterListsByFolder(lists, folderId), query),
    [lists, folderId, query],
  );
  const dated = useMemo(() => datedLists(visibleLists), [visibleLists]);
  const days = useMemo(() => weekDays(anchor), [anchor]);

  const used = useMemo(() => usedFolderIds(lists), [lists]);
  const filterFolders = useMemo(
    () => folders.filter((folder) => used.has(folder.id)),
    [folders, used],
  );

  // La tâche affichée dans la fenêtre est relue à chaque chargement : sans
  // cela, cocher une tâche depuis son détail laisserait la fenêtre montrer
  // l'état d'avant.
  const editedTask =
    openedTask === null
      ? null
      : (lists.flatMap((list) => list.tasks).find((task) => task.id === openedTask.id) ?? null);

  const switcher = <SegmentedControl options={VIEWS} value={view} onChange={setView} />;

  const navigation = (
    <View className="flex-row items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET }}
        onPress={() => setAnchor((current) => addDays(current, -7))}
        accessibilityRole="button"
        accessibilityLabel="Semaine précédente"
      >
        <Icon as={ChevronLeft} className="size-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onPress={() => setAnchor(startOfWeek(new Date()))}
        accessibilityRole="button"
      >
        <Text>Cette semaine</Text>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET }}
        onPress={() => setAnchor((current) => addDays(current, 7))}
        accessibilityRole="button"
        accessibilityLabel="Semaine suivante"
      >
        <Icon as={ChevronRight} className="size-4" />
      </Button>
    </View>
  );

  // La loupe ferme sur elle-même : rouvrir un champ déjà ouvert le viderait,
  // et ce que l'utilisateur cherche à faire en le rappuyant, c'est sortir de
  // la recherche.
  const searchButton = (
    <Button
      variant="ghost"
      size="icon"
      style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET }}
      onPress={() => {
        if (searching) {
          setSearching(false);
          setQuery("");
          return;
        }
        setSearching(true);
        // Le champ n'existe pas encore au moment du clic : le focus attend
        // qu'il soit monté.
        setTimeout(() => search.current?.focus(), 0);
      }}
      accessibilityRole="button"
      accessibilityLabel={searching ? "Fermer la recherche" : "Rechercher une tâche"}
    >
      <Icon as={searching ? X : Search} className="size-4" />
    </Button>
  );

  return (
    <ScreenShell
      title="Todoliste"
      action={
        <Button
          size="sm"
          onPress={() => setListTarget({ mode: "create", folderId: null })}
          accessibilityRole="button"
          accessibilityLabel="Nouvelle liste"
        >
          <Icon as={Plus} className="size-4" />
          <Text>Liste</Text>
        </Button>
      }
      maxWidth={GRID_MAX_WIDTH}
    >
      {/* Sous le point de rupture, la bascule et la navigation ne tiennent
          pas sur la même ligne que la période affichée. */}
      {compact ? (
        <View className="gap-3">
          {view === "week" ? (
            <Text className="text-base font-medium">{weekLabel(anchor)}</Text>
          ) : null}
          <View className="flex-row items-center justify-between gap-2">
            {switcher}
            <View className="flex-row items-center gap-1">
              {view === "week" ? navigation : null}
              {searchButton}
            </View>
          </View>
        </View>
      ) : (
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1">
            {view === "week" ? (
              <Text className="text-base font-medium" numberOfLines={1}>
                {weekLabel(anchor)}
              </Text>
            ) : null}
          </View>
          {switcher}
          <View className="min-w-0 flex-1 flex-row items-center justify-end gap-1">
            {view === "week" ? navigation : null}
            {searchButton}
          </View>
        </View>
      )}

      {/* Sur sa propre ligne : à l'ouverture, le champ prend toute la largeur
          plutôt que de comprimer la bascule de vue. */}
      {searching ? (
        <Input
          ref={search}
          value={query}
          onChangeText={setQuery}
          placeholder="Chercher une tâche ou une liste"
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Chercher une tâche ou une liste"
        />
      ) : null}

      <FolderFilterBar
        folders={filterFolders}
        hasUnfiled={used.has(null)}
        value={folderId}
        onChange={setFolderId}
      />

      {isError ? (
        <Text className="text-destructive text-sm">
          Les todolistes n'ont pas pu être chargées. Réessayez dans un instant.
        </Text>
      ) : null}

      {view === "week" ? (
        <WeekBoard days={days} lists={dated} />
      ) : visibleLists.length === 0 && lists.length > 0 ? (
        // Le message d'accueil de `ListsBoard` mentirait ici : il y a bien des
        // listes, c'est le filtre ou la recherche qui les écarte.
        <Text className="text-muted-foreground text-sm">
          {query.trim().length > 0
            ? "Aucune liste ne correspond."
            : "Aucune liste dans ce dossier."}
        </Text>
      ) : (
        <ListsBoard
          lists={visibleLists}
          {...(openedList ? { highlightedId: openedList } : {})}
          query={query}
          onEditList={(list: TaskList) => setListTarget({ mode: "edit", list })}
          onDeleteList={setDeletingList}
          onOpenTask={setOpenedTask}
        />
      )}

      {isPending ? <Text className="text-muted-foreground text-xs">Chargement…</Text> : null}

      <TaskListDialog target={listTarget} onClose={() => setListTarget(null)} />
      <TaskListDeleteDialog list={deletingList} onClose={() => setDeletingList(null)} />
      <TaskDialog task={editedTask} onClose={() => setOpenedTask(null)} />
    </ScreenShell>
  );
}
