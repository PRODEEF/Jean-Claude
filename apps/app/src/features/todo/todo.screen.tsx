import { useEffect, useMemo, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Plus, Search, X } from "lucide-react-native";
import type { Task, TaskList } from "@jc/domain";
import { MIN_TOUCH_TARGET } from "@jc/design";
import { useFolderChoices } from "@/shared/hooks/use-folder-choices";
import { useTaskLists } from "@/shared/hooks/use-task-lists";
import { filterListsByFolder, filterListsByQuery, usedFolderIds } from "@/shared/lib/tasks";
import { Button } from "@/shared/ui/button";
import { GRID_MAX_WIDTH, ScreenShell } from "@/shared/ui/screen-shell";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Text } from "@/shared/ui/text";
import { FolderFilterBar } from "./FolderFilterBar";
import { ListsBoard } from "./ListsBoard";
import { TaskDialog } from "./TaskDialog";
import { TaskListDeleteDialog } from "./TaskListDeleteDialog";
import { TaskListDialog, type TaskListTarget } from "./TaskListDialog";

/**
 * Onglet Mes listes — vue centralisée, tous dossiers confondus (A.2).
 *
 * Une liste sans échéance reste visible ici : une liste d'achats n'a pas
 * toujours de date, et l'écarter la rendrait introuvable. La lecture par
 * semaine des listes échues vit désormais dans le calendrier, en vue Mois —
 * elle n'a plus sa place ici en double.
 */
export function TodoScreen() {
  const { list: openedList } = useLocalSearchParams<{ list?: string }>();

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
      setFolderId(undefined);
      setQuery("");
    }
  }, [openedList]);

  const { data, isPending, isError } = useTaskLists();
  const lists = useMemo(() => data ?? [], [data]);
  const folders = useFolderChoices();

  const visibleLists = useMemo(
    () => filterListsByQuery(filterListsByFolder(lists, folderId), query),
    [lists, folderId, query],
  );

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
      title="Mes listes"
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
      <View className="flex-row items-center justify-end">{searchButton}</View>

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

      {visibleLists.length === 0 && lists.length > 0 ? (
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
