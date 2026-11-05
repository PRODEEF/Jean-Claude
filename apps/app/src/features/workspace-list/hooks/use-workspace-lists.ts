import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  CreateWorkspaceTask,
  UpdateWorkspaceTask,
  UpdateWorkspaceTaskList,
  WorkspaceTaskList,
} from "@jc/domain";
import { api } from "@/shared/lib/api";

export function useWorkspaceLists(workspaceId: string) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "lists"],
    queryFn: () => api.workspaceLists.list(workspaceId),
  });
}

export function useWorkspaceList(listId: string) {
  return useQuery({
    queryKey: ["workspace-list", listId],
    queryFn: () => api.workspaceLists.get(listId),
  });
}

export function useCreateWorkspaceList(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    /** `folderId` : liste créée depuis un dossier, déjà rangée dedans. */
    mutationFn: ({ title, folderId }: { title: string; folderId: string | null }) =>
      api.workspaceLists.create({ workspaceId, title, folderId, tasks: [] }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, "lists"] }),
  });
}

/**
 * Gestes sur une liste et ses tâches. Chaque tâche s'écrit à part ; au retour,
 * la liste est relue plutôt que patchée : un autre membre a pu la modifier
 * entre-temps.
 */
export function useWorkspaceListActions(list: WorkspaceTaskList) {
  const queryClient = useQueryClient();
  const refresh = () => refreshList(queryClient, list);

  const update = useMutation({
    mutationFn: (patch: UpdateWorkspaceTaskList) => api.workspaceLists.update(list.id, patch),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: () => api.workspaceLists.remove(list.id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["workspace", list.workspaceId, "lists"] }),
  });

  const addTask = useMutation({
    mutationFn: (input: CreateWorkspaceTask) => api.workspaceLists.addTask(list.id, input),
    onSuccess: refresh,
  });

  const updateTask = useMutation({
    mutationFn: (input: { taskId: string; patch: UpdateWorkspaceTask }) =>
      api.workspaceLists.updateTask(list.id, input.taskId, input.patch),
    onSuccess: refresh,
  });

  const removeTask = useMutation({
    mutationFn: (taskId: string) => api.workspaceLists.removeTask(list.id, taskId),
    onSuccess: refresh,
  });

  /**
   * Appliqué à l'écran avant la réponse : sans cela, la ligne lâchée reviendrait
   * à sa place le temps de la relecture, avant de sauter à la bonne. Un refus
   * (ordre périmé, panne) remet la liste telle qu'elle était, puis la relit.
   */
  const reorder = useMutation({
    mutationFn: (taskIds: string[]) => api.workspaceLists.reorderTasks(list.id, { taskIds }),
    onMutate: async (taskIds) => {
      const key = ["workspace-list", list.id];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<WorkspaceTaskList>(key);
      if (previous) queryClient.setQueryData(key, withOrder(previous, taskIds));
      return { previous };
    },
    onError: (_error, _taskIds, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["workspace-list", list.id], context.previous);
      }
    },
    onSettled: refresh,
  });

  return { update, remove, addTask, updateTask, removeTask, reorder };
}

function refreshList(queryClient: QueryClient, list: WorkspaceTaskList) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["workspace-list", list.id] }),
    queryClient.invalidateQueries({ queryKey: ["workspace", list.workspaceId, "lists"] }),
  ]);
}

/** La liste avec ses tâches dans l'ordre donné, positions renumérotées. */
function withOrder(list: WorkspaceTaskList, taskIds: string[]): WorkspaceTaskList {
  const byId = new Map(list.tasks.map((task) => [task.id, task]));
  return {
    ...list,
    tasks: taskIds.flatMap((id, position) => {
      const task = byId.get(id);
      return task ? [{ ...task, position }] : [];
    }),
  };
}
