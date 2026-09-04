import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateTask,
  CreateTaskList,
  ReplaceTasks,
  UpdateTask,
  UpdateTaskList,
} from "@jc/domain";
import { api } from "@/shared/lib/api";

/**
 * Toutes les todolistes, tâches comprises (A.2).
 *
 * Une seule clé de cache pour l'onglet Mes listes, la barre latérale et le
 * calendrier : les trois lisent la même chose sous trois angles, et cocher une
 * tâche depuis l'un doit se voir aussitôt dans les deux autres.
 */
export function useTaskLists() {
  return useQuery({
    queryKey: ["taskLists"],
    queryFn: () => api.tasks.lists(),
  });
}

export function useTaskActions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["taskLists"] });

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

  /**
   * Réécriture du contenu d'une liste depuis l'éditeur.
   *
   * Le rechargement n'a lieu qu'au succès : l'éditeur tient déjà l'état
   * affiché, et rafraîchir à chaque frappe lui reprendrait sa ligne en cours.
   */
  const replaceTasks = useMutation({
    mutationFn: (variables: { listId: string; input: ReplaceTasks }) =>
      api.tasks.replaceTasks(variables.listId, variables.input),
    onSuccess: refresh,
  });

  return { createList, updateList, removeList, addTask, updateTask, removeTask, replaceTasks };
}
