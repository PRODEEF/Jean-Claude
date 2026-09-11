import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  CreateTask,
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
export function useTaskLists() {
  return useQuery({
    queryKey: ["taskLists"],
    queryFn: () => fetchAllLists(),
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

export function useTaskActions() {
  const queryClient = useQueryClient();
  const refresh = () => refreshTaskLists(queryClient);

  const createList = useMutation({
    mutationFn: (input: CreateTaskList) => api.tasks.createList(input),
    onSuccess: refresh,
  });

  const updateList = useMutation({
    mutationFn: (variables: { id: string; patch: UpdateTaskList }) =>
      api.tasks.updateList(variables.id, variables.patch),
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
    mutationFn: (variables: { listId: string; taskId: string; patch: UpdateTask }) =>
      api.tasks.updateTask(variables.listId, variables.taskId, variables.patch),
    onSuccess: refresh,
  });

  const removeTask = useMutation({
    mutationFn: (variables: { listId: string; taskId: string }) =>
      api.tasks.removeTask(variables.listId, variables.taskId),
    onSuccess: refresh,
  });

  return { createList, updateList, removeList, addTask, updateTask, removeTask };
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
