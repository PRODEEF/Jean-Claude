import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  CreateTask,
  CalendarRange,
  CreateTaskList,
  ReplaceTasks,
  TaskListWithTasks,
  UpdateTask,
  UpdateTaskList,
} from "@jc/domain";
import { api } from "@/shared/lib/api";

/**
 * La plus grande page que l'API accepte (`cursorPaginationSchema`) : moins
 * d'allers-retours pour un compte qui reste sous ce volume, ce qui couvre
 * tout utilisateur réel aujourd'hui.
 */
const PAGE_SIZE = 100;

/**
 * Toutes les todolistes, tâches comprises (A.2).
 *
 * Une seule clé de cache pour l'onglet Mes listes, la barre latérale et le
 * calendrier : les trois lisent la même chose sous trois angles, et cocher une
 * tâche depuis l'un doit se voir aussitôt dans les deux autres.
 *
 * L'API est paginée par curseur (garde-fou pour un compte qui accumule
 * beaucoup de listes), mais ce hook en reste à un contrat « tout d'un coup » :
 * les trois écrans qui le consomment, et la recherche client sur ce qui est
 * déjà chargé, supposent la totalité des listes. Il boucle donc sur les pages
 * lui-même plutôt que de répercuter la pagination jusqu'ici.
 */
export function useTaskLists({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["taskLists"],
    queryFn: () => fetchAllLists(),
    enabled,
  });
}

/**
 * Occurrences des listes datées sur une fenêtre (séries dépliées).
 *
 * Même fenêtre que le calendrier, et une clé sous `taskLists` : tout geste qui
 * rafraîchit les listes rafraîchit aussi leurs occurrences.
 */
export function useListOccurrences(range: CalendarRange, { enabled = true } = {}) {
  return useQuery({
    queryKey: ["taskLists", "occurrences", range.from, range.to],
    queryFn: () => api.tasks.occurrences(range),
    enabled,
  });
}

async function fetchAllLists(): Promise<TaskListWithTasks[]> {
  const lists: TaskListWithTasks[] = [];
  let cursor: string | undefined;

  do {
    const page = await api.tasks.lists({ cursor, limit: PAGE_SIZE });
    lists.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  return lists;
}

/**
 * Recharge ce que les todolistes alimentent.
 *
 * Le calendrier est invalidé avec elles : une échéance posée, déplacée ou
 * retirée synchronise l'événement lié côté serveur (A.3), et sans cela
 * l'agenda reste sur l'ancienne date jusqu'au rechargement de la page.
 */
function refreshTaskLists(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["taskLists"] });
  queryClient.invalidateQueries({ queryKey: ["calendar"] });
}

/** Clé commune des changements montrés avant la réponse du serveur. */
const OPTIMISTIC_KEY = ["taskLists", "optimistic"] as const;

/** `target` avec les seules clés renseignées de `patch` : un `undefined` laisse intact, un `null` efface. */
function withPatch<T extends object>(target: T, patch: object): T {
  const next = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) Object.assign(next, { [key]: value });
  }
  return next;
}

export function useTaskActions() {
  const queryClient = useQueryClient();
  const refresh = () => refreshTaskLists(queryClient);

  // Un déplacement ou un changement de date se voit tout de suite, avant la
  // réponse du serveur — comme dans Google Agenda. Si le serveur refuse, l'écran
  // revient à l'état d'avant. Le rechargement n'attend que le dernier geste en
  // cours : sans cela, la réponse du premier d'une rafale replaçait à l'écran
  // ce que le second n'avait pas encore confirmé.
  const showFirst = async (change: (lists: TaskListWithTasks[]) => TaskListWithTasks[]) => {
    await queryClient.cancelQueries({ queryKey: ["taskLists"] });
    const before = queryClient.getQueryData<TaskListWithTasks[]>(["taskLists"]);
    if (before) queryClient.setQueryData<TaskListWithTasks[]>(["taskLists"], change(before));
    return { before };
  };
  const putBack = (context: { before: TaskListWithTasks[] | undefined } | undefined) => {
    if (context?.before) queryClient.setQueryData(["taskLists"], context.before);
  };
  const refreshWhenLast = () => {
    if (queryClient.isMutating({ mutationKey: OPTIMISTIC_KEY }) <= 1) refresh();
  };

  const createList = useMutation({
    mutationFn: (input: CreateTaskList) => api.tasks.createList(input),
    onSuccess: refresh,
  });

  const updateList = useMutation({
    mutationKey: OPTIMISTIC_KEY,
    mutationFn: (variables: { id: string; patch: UpdateTaskList }) =>
      api.tasks.updateList(variables.id, variables.patch),
    onMutate: (variables) =>
      showFirst((lists) =>
        lists.map((list) => (list.id === variables.id ? withPatch(list, variables.patch) : list)),
      ),
    onError: (_error, _variables, context) => putBack(context),
    onSettled: refreshWhenLast,
  });

  /** Les tâches saisies avec la liste, écrites d'un coup une fois la liste créée. */
  const fillList = useMutation({
    mutationFn: (variables: { listId: string; input: ReplaceTasks }) =>
      api.tasks.replaceTasks(variables.listId, variables.input),
    onSuccess: refresh,
  });

  const removeList = useMutation({
    mutationFn: (id: string) => api.tasks.removeList(id),
    onSuccess: refresh,
  });

  const addTask = useMutation({
    mutationFn: (variables: { listId: string; input: CreateTask }) =>
      api.tasks.addTask(variables.listId, variables.input),
    onSuccess: refresh,
  });

  const updateTask = useMutation({
    mutationKey: OPTIMISTIC_KEY,
    mutationFn: (variables: { listId: string; taskId: string; patch: UpdateTask }) =>
      api.tasks.updateTask(variables.listId, variables.taskId, variables.patch),
    onMutate: (variables) =>
      showFirst((lists) =>
        lists.map((list) =>
          list.id === variables.listId
            ? {
                ...list,
                tasks: list.tasks.map((task) =>
                  task.id === variables.taskId ? withPatch(task, variables.patch) : task,
                ),
              }
            : list,
        ),
      ),
    onError: (_error, _variables, context) => putBack(context),
    onSettled: refreshWhenLast,
  });

  const removeTask = useMutation({
    mutationFn: (variables: { listId: string; taskId: string }) =>
      api.tasks.removeTask(variables.listId, variables.taskId),
    onSuccess: refresh,
  });

  return { createList, updateList, fillList, removeList, addTask, updateTask, removeTask };
}

/**
 * Réécriture du contenu d'une liste depuis l'éditeur.
 *
 * Le rechargement n'a lieu qu'au succès : l'éditeur tient déjà l'état affiché,
 * et rafraîchir à chaque frappe lui reprendrait sa ligne en cours.
 *
 * Une portée par liste, et non une mutation partagée : deux réécritures de la
 * même liste ne partent alors jamais ensemble. Sans cela, un enregistrement
 * automatique et une sortie de champ pouvaient se croiser — la seconde ignorait
 * les identifiants que la première était en train d'attribuer, et le serveur
 * recréait les lignes concernées au lieu de les modifier, emportant leur
 * complétion et leurs notes.
 */
export function useReplaceTasks(listId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    scope: { id: `taskList-${listId}` },
    mutationFn: (input: ReplaceTasks) => api.tasks.replaceTasks(listId, input),
    onSuccess: () => refreshTaskLists(queryClient),
  });
}
